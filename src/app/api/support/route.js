import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/mongodb';
import { cache } from '../../../lib/cache';
import { notifyStaffAndDistributorAsync } from '../../../lib/pushNotifications';
import { publishAdminEvent } from '../../../lib/adminEvents';
import { typeBExclusionFilter } from '../../../lib/typeBDistributors';

// GET support chat messages
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const attachmentId = searchParams.get('attachmentId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const db = await getDb();
    const supportCollection = db.collection('supportMessages');

    // Lazy image load — keeps chat thread JSON tiny (base64 proofs stay in DB).
    if (attachmentId) {
      const msg = await supportCollection.findOne(
        { id: String(attachmentId) },
        { projection: { attachment: 1 } }
      );
      const dataUrl = typeof msg?.attachment === 'string' ? msg.attachment : '';
      if (!dataUrl) {
        return new NextResponse('Not found', { status: 404 });
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return new NextResponse(Buffer.from(match[2], 'base64'), {
          headers: {
            'Content-Type': match[1] || 'image/jpeg',
            'Cache-Control': 'private, max-age=3600'
          }
        });
      }
      return new NextResponse('Unsupported attachment', { status: 415 });
    }

    const adminDistributorId = searchParams.get('adminDistributorId');

    let baseQuery = {};
    if (adminDistributorId) {
      baseQuery.distributorId = adminDistributorId;
    } else if (!email) {
      // Exclude chats belonging to Type B distributors ONLY for generic admin views
      // If email is present, player is querying their own chat, so don't exclude!
      baseQuery = await typeBExclusionFilter(db);
    }

    if (email) {
      // Return conversation history for a specific player (text first — no inline base64)
      const emailKey = email.toLowerCase().trim();
      // Default window is the MOST RECENT messages. Older chats with 50+ messages
      // used to load only the oldest page — so new admin replies appeared then
      // vanished on refresh because they were outside that window.
      const threadLimit = Math.min(Math.max(limit, 1), 200);

      // Distributor may open a chat even if the player never messaged yet
      if (adminDistributorId) {
        const owner = await db.collection('users').findOne(
          { email: emailKey },
          { projection: { email: 1, name: 1, distributorId: 1, role: 1 } }
        );
        if (!owner || owner.distributorId !== adminDistributorId || (owner.role && owner.role !== 'user')) {
          return NextResponse.json({
            success: false,
            message: 'Player not found under your distributor account.',
            messages: [],
            playerName: ''
          }, { status: 404 });
        }
      }

      // Exclude huge attachment payloads so chat opens instantly (images load via attachmentId).
      // Newest-first fetch, then reverse so UI still renders oldest → newest.
      const newestFirst = await supportCollection
        .find({ userEmail: emailKey })
        .project({
          _id: 0,
          id: 1,
          userEmail: 1,
          userName: 1,
          message: 1,
          senderType: 1,
          senderEmail: 1,
          read: 1,
          timestamp: 1,
          distributorId: 1,
          distributorType: 1,
          hasAttachment: 1,
          reactions: 1,
          replyTo: 1,
          isEdited: 1,
          editedAt: 1,
          isDeleted: 1,
          deletedForEveryone: 1,
          deletedFor: 1
        })
        .sort({ timestamp: -1 })
        .skip(Math.max(0, (page - 1) * threadLimit))
        .limit(threadLimit)
        .toArray();
      const rawMessages = newestFirst.reverse();

      const isGuest =
        emailKey.includes('@jackpotguest.com') || emailKey.startsWith('guest_');
      let playerName = isGuest ? 'Guest' : '';
      if (!isGuest) {
        const userDoc = await db.collection('users').findOne(
          { email: emailKey },
          { projection: { name: 1 } }
        );
        playerName = (userDoc?.name || '').trim();
        if (!playerName) {
          const fromMsg = [...rawMessages].reverse().find((m) => {
            const raw = String(m.userName || '').trim();
            return raw && !/^support\s*agent$/i.test(raw) && !/^player$/i.test(raw);
          });
          const raw = String(fromMsg?.userName || '').trim();
          playerName = raw
            ? (/^guest(\s*#?\d+)?$/i.test(raw) ? 'Guest' : raw)
            : emailKey.split('@')[0] || 'Guest';
        }
      }

      const reqUserEmail = emailKey;
      const leanMessages = rawMessages
        .filter((m) => {
          if (Array.isArray(m.deletedFor) && m.deletedFor.includes(reqUserEmail)) {
            return false;
          }
          return true;
        })
        .map((m) => {
          const isForEveryoneDeleted = Boolean(m.deletedForEveryone || m.isDeleted);
          const showAttachment = !isForEveryoneDeleted && m.hasAttachment !== false && Boolean(m.id);
          return {
            ...m,
            message: isForEveryoneDeleted ? 'This message was deleted' : m.message,
            playerName,
            reactions: m.reactions || {},
            replyTo: m.replyTo || null,
            isEdited: Boolean(m.isEdited),
            isDeleted: isForEveryoneDeleted,
            attachment: showAttachment
              ? `/api/support?attachmentId=${encodeURIComponent(m.id)}`
              : ''
          };
        });

      return NextResponse.json({ success: true, messages: leanMessages, playerName });
    }

    // Admin / distributor conversation list — group by player so unread chats
    // are never dropped just because other threads filled a raw message limit.
    const skip = (page - 1) * limit;

    // Treat missing/empty distributorType as non-B (guest + normal players)
    const listMatch = adminDistributorId
      ? { distributorId: adminDistributorId }
      : {
          $or: [
            { distributorType: { $exists: false } },
            { distributorType: null },
            { distributorType: '' },
            { distributorType: { $nin: ['B'] } }
          ]
        };

    const unreadMatch = {
      ...listMatch,
      senderType: 'player',
      read: false
    };

    const [grouped, unreadEmails, totalConversations] = await Promise.all([
      supportCollection
        .aggregate([
          { $match: listMatch },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: { $toLower: { $ifNull: ['$userEmail', ''] } },
              userEmail: { $first: '$userEmail' },
              userName: { $first: '$userName' },
              lastMessage: { $first: '$message' },
              // Prefer stored hasAttachment flag (set on write). Avoid $first:'$attachment'
              // which forces Mongo to load multi-MB base64 into the pipeline.
              lastAttachment: { $first: { $ifNull: ['$hasAttachment', false] } },
              timestamp: { $first: '$timestamp' },
              senderType: { $first: '$senderType' },
              unread: {
                $max: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$senderType', 'player'] },
                        { $eq: ['$read', false] }
                      ]
                    },
                    true,
                    false
                  ]
                }
              },
              playerMsgName: {
                $first: {
                  $cond: [{ $eq: ['$senderType', 'player'] }, '$userName', null]
                }
              }
            }
          },
          { $match: { _id: { $ne: '' } } },
          {
            $addFields: {
              unreadRank: { $cond: ['$unread', 0, 1] }
            }
          },
          { $sort: { unreadRank: 1, timestamp: -1 } },
          { $skip: skip },
          { $limit: limit }
        ])
        .toArray(),
      supportCollection.distinct('userEmail', unreadMatch),
      supportCollection
        .aggregate([
          { $match: listMatch },
          { $group: { _id: { $toLower: { $ifNull: ['$userEmail', ''] } } } },
          { $match: { _id: { $ne: '' } } },
          { $count: 'total' }
        ])
        .toArray()
    ]);

    // If an unread thread fell outside this page window, still surface it on page 1
    if (page === 1 && unreadEmails.length > 0) {
      const present = new Set(grouped.map((g) => String(g._id || '').toLowerCase()));
      const missingUnread = unreadEmails
        .map((e) => String(e || '').toLowerCase().trim())
        .filter((e) => e && !present.has(e));

      if (missingUnread.length > 0) {
        const extras = await supportCollection
          .aggregate([
            { $match: { ...listMatch, userEmail: { $in: missingUnread } } },
            { $sort: { timestamp: -1 } },
            {
              $group: {
                _id: { $toLower: { $ifNull: ['$userEmail', ''] } },
                userEmail: { $first: '$userEmail' },
                userName: { $first: '$userName' },
                lastMessage: { $first: '$message' },
                lastAttachment: { $first: { $ifNull: ['$hasAttachment', false] } },
                timestamp: { $first: '$timestamp' },
                senderType: { $first: '$senderType' },
                unread: { $literal: true },
                playerMsgName: {
                  $first: {
                    $cond: [{ $eq: ['$senderType', 'player'] }, '$userName', null]
                  }
                }
              }
            }
          ])
          .toArray();

        grouped.unshift(...extras);
        grouped.sort((a, b) => {
          if (a.unread && !b.unread) return -1;
          if (!a.unread && b.unread) return 1;
          return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
        });
      }
    }

    const emails = Array.from(
      new Set(grouped.map((g) => String(g.userEmail || '').toLowerCase().trim()).filter(Boolean))
    );

    const nameByEmail = {};
    if (emails.length > 0) {
      const users = await db
        .collection('users')
        .find({ email: { $in: emails } })
        .project({ email: 1, name: 1 })
        .toArray();
      users.forEach((u) => {
        if (u.email) nameByEmail[u.email.toLowerCase().trim()] = (u.name || '').trim();
      });
    }

    const resolvePlayerName = (emailKey, fallbackName) => {
      if (!emailKey) return 'Guest';
      if (emailKey.includes('@jackpotguest.com') || emailKey.startsWith('guest_')) return 'Guest';
      if (nameByEmail[emailKey]) return nameByEmail[emailKey];
      const raw = String(fallbackName || '').trim();
      if (raw && !/^support\s*agent$/i.test(raw) && !/^player$/i.test(raw)) {
        return /^guest(\s*#?\d+)?$/i.test(raw) ? 'Guest' : raw;
      }
      return emailKey.split('@')[0] || 'Guest';
    };

    const conversations = grouped.map((g) => {
      const emailKey = String(g.userEmail || '').toLowerCase().trim();
      const playerName = resolvePlayerName(emailKey, g.playerMsgName || g.userName);
      const preview =
        (g.lastMessage && String(g.lastMessage).trim()) ||
        (g.lastAttachment ? '[Image]' : '');
      return {
        email: emailKey,
        userEmail: emailKey,
        name: playerName,
        playerName,
        lastMessage: preview,
        timestamp: g.timestamp,
        unread: !!g.unread
      };
    });

    // Keep legacy `messages` shape so older clients still group something
    const messages = conversations.map((c) => ({
      id: `conv-${c.email}`,
      userEmail: c.email,
      userName: c.name,
      playerName: c.name,
      message: c.lastMessage,
      timestamp: c.timestamp,
      senderType: c.unread ? 'player' : 'admin',
      read: !c.unread
    }));

    return NextResponse.json({
      success: true,
      conversations,
      messages,
      totalConversations: totalConversations[0]?.total || conversations.length,
      unreadCount: unreadEmails.length
    });
  } catch (err) {
    console.error('Fetch Support Messages Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// POST new support message (Player or Admin reply)
export async function POST(req) {
  try {
    const { userEmail, userName, message, attachment, senderType, senderEmail, replyTo } = await req.json();

    if (!userEmail || !senderType) {
      return NextResponse.json({ success: false, message: 'User email and sender type are required.' }, { status: 400 });
    }

    const db = await getDb();
    const supportCollection = db.collection('supportMessages');

    // Look up the player to tag their distributor settings
    const userDoc = await db.collection('users').findOne({ email: userEmail.toLowerCase().trim() });
    const distId = userDoc ? (userDoc.distributorId || '') : '';
    let distType = '';
    let distName = '';

    if (distId) {
      const distributor = await db.collection('distributors').findOne({ id: distId });
      if (distributor) {
        distType = distributor.type || 'A';
        distName = distributor.name || '';
      }
    }

    const newMsg = {
      id: Date.now().toString() + Math.floor(Math.random() * 100).toString(),
      userEmail: userEmail.toLowerCase().trim(),
      // Thread identity = player/guest name (never "Support Agent" on admin replies)
      userName: (() => {
        const emailLower = userEmail.toLowerCase().trim();
        const isGuestEmail =
          emailLower.includes('@jackpotguest.com') || emailLower.startsWith('guest_');
        if (isGuestEmail) return 'Guest';
        if (senderType === 'admin') {
          return (userDoc?.name || userName || 'Player').trim() || 'Player';
        }
        const cleaned = String(userName || '').trim();
        if (!cleaned || /^support\s*agent$/i.test(cleaned)) {
          return userDoc?.name || 'Player';
        }
        if (/^guest(\s*#?\d+)?$/i.test(cleaned)) return 'Guest';
        return cleaned;
      })(),
      message: message ? message.trim() : '',
      attachment: attachment || '',
      hasAttachment: Boolean(attachment && String(attachment).trim()),
      replyTo: replyTo && typeof replyTo === 'object' ? {
        id: String(replyTo.id || ''),
        message: String(replyTo.message || '').slice(0, 200),
        senderName: String(replyTo.senderName || 'User')
      } : null,
      reactions: {},
      deletedFor: [],
      deletedForEveryone: false,
      isEdited: false,
      senderType, // 'player' | 'admin'
      senderEmail: senderEmail ? senderEmail.toLowerCase().trim() : '',
      read: false, // newly sent messages are unread by recipient
      timestamp: new Date().toISOString(),
      distributorId: distId,
      distributorType: distType,
      distributorName: distName
    };

    await supportCollection.insertOne(newMsg);

    // Invalidate stats cache + SSE so Support tab opens the new thread instantly
    cache.del('admin_stats');
    publishAdminEvent('support', { distributorId: distId || '', senderType });

    if (senderType === 'player') {
      let playerDisplayName = (userName && userName !== '-' && userName !== '—') ? userName : userEmail;
      if ((!playerDisplayName || playerDisplayName === userEmail) && userEmail) {
        const uDoc = await db.collection('users').findOne({ email: userEmail.toLowerCase().trim() }, { projection: { name: 1 } });
        if (uDoc?.name && uDoc.name.trim() && uDoc.name.trim() !== '-' && uDoc.name.trim() !== '—') {
          playerDisplayName = uDoc.name.trim();
        }
      }

      notifyStaffAndDistributorAsync(db, {
        title: 'New Support Message',
        body: `${playerDisplayName}: ${(message || 'Attachment').slice(0, 100)}`,
        adminUrl: '/admin/support',
        distributorUrl: '/distributor/support',
        url: '/admin/support',
        tag: `support-${newMsg.id}`,
        alertKind: 'support'
      }, distId);
    }

    return NextResponse.json({ success: true, message: newMsg });
  } catch (err) {
    console.error('Create Support Message Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PUT mark support messages as read
export async function PUT(req) {
  try {
    const { email, role } = await req.json();
    if (!email) {
      return NextResponse.json({ success: false, message: 'User email is required.' }, { status: 400 });
    }

    const db = await getDb();
    const supportCollection = db.collection('supportMessages');
    const userEmailKey = email.toLowerCase().trim();

    if (role === 'player') {
      // Player is reading admin messages
      await supportCollection.updateMany(
        { userEmail: userEmailKey, senderType: 'admin', read: false },
        { $set: { read: true, readAt: new Date().toISOString() } }
      );
    } else if (role === 'admin') {
      // Admin is reading player messages
      await supportCollection.updateMany(
        { userEmail: userEmailKey, senderType: 'player', read: false },
        { $set: { read: true, readAt: new Date().toISOString() } }
      );
    } else {
      // Mark all opposing messages as read
      await supportCollection.updateMany(
        { userEmail: userEmailKey, read: false },
        { $set: { read: true, readAt: new Date().toISOString() } }
      );
    }

    // Invalidate stats cache
    cache.del('admin_stats');

    return NextResponse.json({ success: true, message: 'Messages marked as read.' });
  } catch (err) {
    console.error('Update Support Messages Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PATCH reactions, edits, and deletions
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { action, messageId, emoji, userEmail, text } = body;
    if (!messageId || !action) {
      return NextResponse.json({ success: false, message: 'messageId and action required.' }, { status: 400 });
    }

    const db = await getDb();
    const supportCollection = db.collection('supportMessages');
    const msg = await supportCollection.findOne(
      { id: String(messageId) },
      { projection: { id: 1, distributorId: 1, reactions: 1, deletedFor: 1 } }
    );

    if (!msg) {
      return NextResponse.json({ success: false, message: 'Message not found.' }, { status: 404 });
    }

    if (action === 'react') {
      const emailKey = (userEmail || '').toLowerCase().trim();
      if (!emoji || !emailKey) {
        return NextResponse.json({ success: false, message: 'Emoji and userEmail required.' }, { status: 400 });
      }
      const reactions = msg.reactions || {};
      const currentList = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
      let updatedList;
      if (currentList.includes(emailKey)) {
        updatedList = currentList.filter((e) => e !== emailKey);
      } else {
        updatedList = [...currentList, emailKey];
      }
      if (updatedList.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = updatedList;
      }
      await supportCollection.updateOne({ id: String(messageId) }, { $set: { reactions } });
      publishAdminEvent('support', { distributorId: msg.distributorId || '' });
      return NextResponse.json({ success: true, reactions });
    }

    if (action === 'edit') {
      if (!text || !text.trim()) {
        return NextResponse.json({ success: false, message: 'Message text cannot be empty.' }, { status: 400 });
      }
      await supportCollection.updateOne(
        { id: String(messageId) },
        {
          $set: {
            message: text.trim(),
            isEdited: true,
            editedAt: new Date().toISOString()
          }
        }
      );
      publishAdminEvent('support', { distributorId: msg.distributorId || '' });
      return NextResponse.json({ success: true, message: 'Message edited.' });
    }

    if (action === 'delete_for_me') {
      const emailKey = (userEmail || '').toLowerCase().trim();
      const deletedFor = Array.isArray(msg.deletedFor) ? [...msg.deletedFor] : [];
      if (!deletedFor.includes(emailKey)) {
        deletedFor.push(emailKey);
        await supportCollection.updateOne({ id: String(messageId) }, { $set: { deletedFor } });
      }
      return NextResponse.json({ success: true, message: 'Message deleted for you.' });
    }

    if (action === 'delete_for_everyone') {
      await supportCollection.updateOne(
        { id: String(messageId) },
        {
          $set: {
            deletedForEveryone: true,
            isDeleted: true,
            message: 'This message was deleted',
            attachment: '',
            hasAttachment: false
          }
        }
      );
      publishAdminEvent('support', { distributorId: msg.distributorId || '' });
      return NextResponse.json({ success: true, message: 'Message deleted for everyone.' });
    }

    return NextResponse.json({ success: false, message: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH Support Message Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

