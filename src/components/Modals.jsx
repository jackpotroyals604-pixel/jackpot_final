'use client';

import PanelModalBackdrop from './PanelModalBackdrop';
import React, { useState, useEffect, useRef } from 'react';
import { compressImageFile } from '../lib/imageCompress';
import { formatDeviceTime } from '../lib/formatDateTime';

/** Full-screen image viewer for chat attachments / proofs (works with base64; no new tab). */
export function ImageLightbox({ src, onClose, alt = 'Screenshot' }) {
  if (!src) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.94)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        cursor: 'zoom-out'
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: '50%',
          color: '#fff',
          width: '42px',
          height: '42px',
          fontSize: '1.5rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1
        }}
      >
        &times;
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '96%',
          maxHeight: '92vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: '10px',
          border: '2px solid var(--gold-primary)',
          boxShadow: '0 0 40px rgba(255,215,0,0.18)',
          cursor: 'default'
        }}
      />
    </div>
  );
}

// --- A) CUSTOMER SUPPORT MODAL ---
export function SupportModal({ isOpen, onClose, currentUser, onMessagesSeen }) {
  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [deleteModalMsg, setDeleteModalMsg] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const onMessagesSeenRef = useRef(onMessagesSeen);
  onMessagesSeenRef.current = onMessagesSeen;

  const quickEmojis = ['🎰', '🔥', '💰', '👍', '👑', '💎', '🚀', '❤️', '😂'];

  // Get active email & name for chat (either logged-in user or guest)
  const getChatIdentity = () => {
    if (currentUser) {
      return { email: currentUser.email, name: currentUser.name || currentUser.email.split('@')[0], isGuest: false };
    }
    
    // Check localStorage for guest
    if (typeof window !== 'undefined') {
      let email = localStorage.getItem('jackpot_guest_email');
      let name = localStorage.getItem('jackpot_guest_name');
      if (!email) {
        const randId = Math.floor(100000 + Math.random() * 900000);
        email = `guest_${randId}@jackpotguest.com`;
        name = 'Guest';
        localStorage.setItem('jackpot_guest_email', email);
        localStorage.setItem('jackpot_guest_name', name);
      } else {
        name = 'Guest';
        localStorage.setItem('jackpot_guest_name', name);
      }
      return { email, name, isGuest: true };
    }
    
    return { email: 'guest@jackpotguest.com', name: 'Guest', isGuest: true };
  };

  useEffect(() => {
    if (!isOpen) {
      setLoadingChat(false);
      return;
    }

    const identity = getChatIdentity();
    let firstLoad = true;
    setLoadingChat(true);
    setMessages([]);

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/support?email=${encodeURIComponent(identity.email)}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages);
          if (typeof onMessagesSeenRef.current === 'function') {
            onMessagesSeenRef.current(data.messages || []);
          }
          // Mark admin messages as read by player
          const hasUnreadAdmin = (data.messages || []).some(m => m.senderType === 'admin' && !m.read);
          if (hasUnreadAdmin) {
            fetch('/api/support', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: identity.email, role: 'player' })
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Failed to load support chat:', err);
      } finally {
        if (firstLoad) {
          firstLoad = false;
          setLoadingChat(false);
        }
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);

    return () => clearInterval(interval);
  }, [isOpen, currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleToggleReaction = async (messageId, emoji) => {
    const { email: userEmail } = getChatIdentity();
    try {
      const res = await fetch('/api/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'react',
          messageId,
          emoji,
          userEmail
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
        );
      }
    } catch (err) {
      console.error('Toggle reaction error:', err);
    }
  };

  const handleStartEdit = (msg) => {
    setEditingMsg(msg);
    setInput(msg.message || '');
    setReplyTo(null);
  };

  const handleStartReply = (msg) => {
    const isMe = msg.senderType === 'player';
    setReplyTo({
      id: msg.id,
      message: msg.message || (msg.attachment ? '[Image]' : ''),
      senderName: isMe ? 'You' : 'Support Agent'
    });
    setEditingMsg(null);
  };

  const handleDeleteForMe = async (msgId) => {
    const { email: userEmail } = getChatIdentity();
    setDeleteModalMsg(null);
    const prevMessages = messages;

    // Optimistically remove from UI
    setMessages((prev) => prev.filter((m) => m.id !== msgId));

    try {
      const res = await fetch('/api/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_for_me',
          messageId: msgId,
          userEmail
        })
      });
      const data = await res.json();
      if (!data.success) {
        setMessages(prevMessages);
      }
    } catch (err) {
      console.error('Delete for me error:', err);
      setMessages(prevMessages);
    }
  };

  const handleDeleteForEveryone = async (msgId) => {
    const { email: userEmail } = getChatIdentity();
    setDeleteModalMsg(null);
    const prevMessages = messages;

    // Optimistically update to deleted message in UI
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, message: 'This message was deleted', isDeleted: true, attachment: '' }
          : m
      )
    );

    try {
      const res = await fetch('/api/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_for_everyone',
          messageId: msgId,
          userEmail
        })
      });
      const data = await res.json();
      if (!data.success) {
        setMessages(prevMessages);
      }
    } catch (err) {
      console.error('Delete for everyone error:', err);
      setMessages(prevMessages);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && !attachment) return;

    const { email: userEmail, name: userName } = getChatIdentity();

    if (editingMsg) {
      const editedText = input.trim();
      if (!editedText) return;
      const targetId = editingMsg.id;
      const prevMessages = messages;

      // 1. Immediately reset form state — 0ms UI response
      setInput('');
      setEditingMsg(null);

      // 2. Instantly update messages in UI
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === targetId) {
            return { ...m, message: editedText, isEdited: true, editedAt: new Date().toISOString() };
          }
          if (m.replyTo?.id === targetId) {
            return { ...m, replyTo: { ...m.replyTo, message: editedText } };
          }
          return m;
        })
      );

      // 3. Sync to server in background
      try {
        const response = await fetch('/api/support', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit',
            messageId: targetId,
            text: editedText,
            userEmail
          })
        });
        const data = await response.json();
        if (!data.success) {
          setMessages(prevMessages);
          alert(data.message || 'Failed to edit message.');
        }
      } catch (err) {
        console.error('Edit support msg error:', err);
        setMessages(prevMessages);
      }
      return;
    }

    const msgText = input;
    const currentAttachment = attachment;
    const currentReply = replyTo;

    setInput('');
    setAttachment('');
    setReplyTo(null);

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail,
          userName,
          message: msgText,
          attachment: currentAttachment,
          senderType: 'player',
          senderEmail: userEmail,
          replyTo: currentReply
        })
      });
      const data = await response.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch (err) {
      console.error('Send support msg error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px', height: '580px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="modal-header" style={{ padding: '0.9rem 1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>
            <i className="fa-solid fa-headset gold-text"></i> Live Customer Support
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        
        <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.85rem', overflow: 'hidden', background: '#080a10' }}>
          <p style={{ fontSize: '0.72rem', opacity: 0.7, marginBottom: '0.6rem', textAlign: 'center' }}>
            Experiencing login, OTP, coin or withdrawal issues? Text our support agent.
          </p>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem', marginBottom: '0.5rem' }}>
            {loadingChat ? (
              <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.7, fontSize: '0.8rem' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)' }}></i>
                Loading chat…
              </div>
            ) : messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
                <i className="fa-solid fa-comments" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', color: 'var(--gold-primary)' }}></i>
                No messages yet. Send a message to start!
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderType === 'player';
                const isDeleted = Boolean(msg.isDeleted);
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      background: isMe ? 'var(--gold-primary)' : 'rgba(255,255,255,0.08)',
                      color: isMe ? '#000' : '#fff',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '12px',
                      borderBottomRightRadius: isMe ? '2px' : '12px',
                      borderBottomLeftRadius: isMe ? '12px' : '2px',
                      fontSize: '0.8rem',
                      maxWidth: '80%',
                      fontWeight: isMe ? '600' : 'normal',
                      wordBreak: 'break-word',
                      opacity: isDeleted ? 0.6 : 1,
                      fontStyle: isDeleted ? 'italic' : 'normal'
                    }}>
                      {/* Quote Reply if present */}
                      {msg.replyTo && (
                        <div style={{ background: isMe ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)', borderLeft: `3px solid ${isMe ? '#000' : 'var(--gold-primary)'}`, padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.68rem', marginBottom: '0.4rem' }}>
                          <strong style={{ display: 'block', fontSize: '0.62rem', opacity: 0.9 }}>{msg.replyTo.senderName}</strong>
                          {msg.replyTo.message}
                        </div>
                      )}
                      
                      {msg.message}

                      {msg.attachment && !isDeleted && (
                        <img
                          src={msg.attachment}
                          alt="Support Attachment"
                          loading="lazy"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '180px',
                            display: 'block',
                            borderRadius: '8px',
                            marginTop: '0.4rem',
                            border: '1px solid rgba(255,255,255,0.1)',
                            cursor: 'zoom-in'
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxSrc(msg.attachment);
                          }}
                          title="Tap to enlarge"
                        />
                      )}

                      {/* Display Badged Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                          {Object.entries(msg.reactions).map(([emoji, uList]) => {
                            if (!Array.isArray(uList) || uList.length === 0) return null;
                            return (
                              <span
                                key={emoji}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleReaction(msg.id, emoji);
                                }}
                                style={{
                                  background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(255,215,0,0.2)',
                                  border: `1px solid ${isMe ? 'rgba(0,0,0,0.3)' : 'rgba(255,215,0,0.4)'}`,
                                  borderRadius: '10px',
                                  padding: '0.05rem 0.35rem',
                                  fontSize: '0.65rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontWeight: 'bold',
                                  color: isMe ? '#000' : '#fff'
                                }}
                              >
                                {emoji} {uList.length}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Action buttons + Reactions (INSIDE message container) */}
                      {!isDeleted && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          marginTop: '0.45rem',
                          paddingTop: '0.35rem',
                          borderTop: isMe ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.08)',
                          fontSize: '0.675rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleStartReply(msg)}
                              style={{ background: 'none', border: 'none', color: isMe ? 'rgba(0,0,0,0.75)' : '#cbd5e1', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '0.675rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                            >
                              <i className="fa-solid fa-reply"></i> Reply
                            </button>

                            {isMe && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(msg)}
                                style={{ background: 'none', border: 'none', color: isMe ? 'rgba(0,0,0,0.75)' : '#cbd5e1', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '0.675rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >
                                <i className="fa-solid fa-pen-to-square"></i> Edit
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setDeleteModalMsg(msg)}
                              style={{ background: 'none', border: 'none', color: isMe ? '#b91c1c' : '#ef4444', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '0.675rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                            >
                              <i className="fa-solid fa-trash"></i> Delete
                            </button>
                          </div>

                          {/* Quick Reaction Emojis inside bubble */}
                          <div style={{ display: 'inline-flex', gap: '5px' }}>
                            {['❤️', '👍', '🔥'].map((emoji) => (
                              <span
                                key={emoji}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleReaction(msg.id, emoji);
                                }}
                                style={{ cursor: 'pointer', fontSize: '0.75rem', transition: 'transform 0.1s' }}
                                title={`React ${emoji}`}
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <span style={{ fontSize: '0.55rem', opacity: 0.65, marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {isMe ? 'You' : 'Support Agent'} • {formatDeviceTime(msg.timestamp)}
                      {msg.isEdited && <span style={{ color: 'var(--gold-primary)', fontStyle: 'italic', marginLeft: '3px' }}>(edited)</span>}
                      {isMe && !isDeleted && (
                        msg.read ? (
                          <span style={{ color: '#60a5fa', fontWeight: 'bold', marginLeft: '3px' }}>
                            • <i className="fa-solid fa-check-double" style={{ fontSize: '0.6rem' }}></i> Seen
                          </span>
                        ) : (
                          <span style={{ opacity: 0.6, marginLeft: '3px' }}>
                            • <i className="fa-solid fa-check" style={{ fontSize: '0.6rem' }}></i> Sent
                          </span>
                        )
                      )}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Replying Banner Header */}
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,215,0,0.1)', padding: '0.35rem 0.6rem', borderRadius: '8px', borderLeft: '3px solid var(--gold-primary)', marginBottom: '0.4rem' }}>
              <i className="fa-solid fa-reply" style={{ color: 'var(--gold-primary)', fontSize: '0.75rem' }}></i>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--gold-primary)', fontWeight: 'bold', display: 'block' }}>Replying to {replyTo.senderName}</span>
                <span style={{ fontSize: '0.65rem', color: '#ccc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }}>{replyTo.message}</span>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.9rem', cursor: 'pointer' }}>&times;</button>
            </div>
          )}

          {/* Editing Banner Header */}
          {editingMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(168,85,247,0.1)', padding: '0.35rem 0.6rem', borderRadius: '8px', borderLeft: '3px solid #a855f7', marginBottom: '0.4rem' }}>
              <i className="fa-solid fa-pen-to-square" style={{ color: '#a855f7', fontSize: '0.75rem' }}></i>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.65rem', color: '#a855f7', fontWeight: 'bold' }}>Editing Message</span>
              </div>
              <button type="button" onClick={() => { setEditingMsg(null); setInput(''); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.9rem', cursor: 'pointer' }}>&times;</button>
            </div>
          )}

          {attachment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.3)', marginBottom: '0.5rem' }}>
              <img src={attachment} alt="attachment preview" style={{ width: '35px', height: '35px', objectFit: 'cover', borderRadius: '4px' }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flex: 1 }}>Image attached (ready to send)</span>
              <button type="button" onClick={() => setAttachment('')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.9rem', cursor: 'pointer', padding: '0 0.2rem' }}>&times;</button>
            </div>
          )}

          {/* Quick Emoji Toolbar (matching user's screenshot) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '0.3rem 0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '0.4rem', overflowX: 'auto' }}>
            <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>QUICK:</span>
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setInput((prev) => prev + emoji)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '2px', transition: 'transform 0.1s' }}
              >
                {emoji}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  alert('Screenshot attachment must be less than 2MB.');
                  e.target.value = '';
                  return;
                }
                try {
                  const compressed = await compressImageFile(file, { maxSize: 1280, quality: 0.72 });
                  setAttachment(compressed);
                } catch (err) {
                  console.error(err);
                  alert('Could not load image. Try another file.');
                }
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: '#1c1e2b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'var(--gold-primary)',
                cursor: 'pointer',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: 0,
                fontSize: '0.95rem'
              }}
              title="Attach screenshot proof"
            >
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input
              type="text"
              placeholder={editingMsg ? "Edit message..." : "Type your message..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                flex: 1,
                background: '#0c0e17',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '0.65rem 1rem',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none',
                height: '40px'
              }}
              required={!attachment}
            />
            <button
              type="submit"
              style={{
                background: 'var(--gold-primary)',
                border: 'none',
                borderRadius: '8px',
                color: '#000',
                fontWeight: 'bold',
                padding: '0 1rem',
                height: '40px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                fontSize: '0.85rem'
              }}
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      </div>
    </PanelModalBackdrop>

    {/* Delete Option Modal / Popup */}
    {deleteModalMsg && (
      <PanelModalBackdrop onClick={() => setDeleteModalMsg(null)}>
        <div
          className="modal-content border-gold"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '360px', padding: '1.25rem', background: '#0b0d16', borderRadius: '12px', textAlign: 'center' }}
        >
          <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
            <i className="fa-solid fa-trash text-red"></i> Delete Message
          </h4>
          <p style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '1.25rem' }}>
            Choose how you want to delete this message:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => handleDeleteForMe(deleteModalMsg.id)}
              style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.6rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Delete for me
            </button>
            <button
              type="button"
              onClick={() => handleDeleteForEveryone(deleteModalMsg.id)}
              style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '0.6rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Delete for everyone
            </button>
            <button
              type="button"
              onClick={() => setDeleteModalMsg(null)}
              style={{ background: 'none', border: 'none', color: '#888', padding: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.2rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </PanelModalBackdrop>
    )}

    {lightboxSrc && (
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc('')} />
    )}
    </>
  );
}

// --- B) GOOGLE WARNING MODAL ---
export function GoogleWarningModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-red" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-triangle-exclamation text-red"></i> Browser Limitation
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p>Google authentication is blocked inside Facebook/Messenger's webview wrapper for safety.</p>
          <p className="text-secondary">
            Please click the top-right menu icon in Messenger (the <strong>three dots</strong> or{' '}
            <strong>compass icon</strong>) and select <strong>"Open in Chrome"</strong> or{' '}
            <strong>"Open in Safari"</strong> to continue with Google.
          </p>
          <button type="button" className="submit-btn red-btn" onClick={onClose}>
            <span>UNDERSTOOD</span>
          </button>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- B2) DEVICE LOCK / DUPLICATE ACCOUNT ALERT MODAL ---
export function DeviceAlertModal({ isOpen, onClose, message, existingEmail, onGoToLogin, onGoToForgot, onOpenSupport }) {
  if (!isOpen) return null;

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div
        className="modal-content border-red"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '400px',
          width: '92%',
          background: 'linear-gradient(180deg, #18111e 0%, #0d0f18 100%)',
          border: '1.5px solid rgba(239, 68, 68, 0.45)',
          borderRadius: '22px',
          padding: '1.65rem 1.25rem 1.4rem',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(239, 68, 68, 0.2)',
          position: 'relative',
          margin: 'auto'
        }}
      >
        <button
          type="button"
          className="close-modal"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '0.85rem',
            right: '0.85rem',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            cursor: 'pointer',
            zIndex: 10
          }}
        >
          &times;
        </button>

        {/* Glowing Alert Icon */}
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '2px solid rgba(239, 68, 68, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.85rem',
            fontSize: '1.6rem',
            color: '#f87171',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)'
          }}
        >
          <i className="fa-solid fa-mobile-screen-button"></i>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-heading, sans-serif)',
            fontSize: '1.2rem',
            fontWeight: '900',
            color: '#fff',
            margin: '0 0 0.45rem',
            textTransform: 'uppercase',
            letterSpacing: '0.03em'
          }}
        >
          Account Detected
        </h3>

        <p
          style={{
            fontSize: '0.82rem',
            color: '#fca5a5',
            lineHeight: '1.4',
            margin: '0 0 0.6rem',
            fontWeight: '700'
          }}
        >
          {message || 'You already have an account from this device.'}
        </p>

        {/* Registered Email Display Badge */}
        {existingEmail && (
          <div
            style={{
              background: 'rgba(0, 210, 255, 0.06)',
              border: '1px solid rgba(0, 210, 255, 0.3)',
              borderRadius: '12px',
              padding: '0.65rem 0.85rem',
              margin: '0 0 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              boxShadow: '0 0 15px rgba(0, 210, 255, 0.08)'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(0, 210, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00d2ff',
                fontSize: '0.9rem',
                flexShrink: 0
              }}
            >
              <i className="fa-solid fa-envelope"></i>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.58rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.04em' }}>
                Your Registered Email
              </span>
              <span style={{ fontSize: '0.85rem', color: '#00d2ff', fontWeight: '900', wordBreak: 'break-all', display: 'block' }}>
                {existingEmail}
              </span>
            </div>
          </div>
        )}

        <p
          style={{
            fontSize: '0.72rem',
            color: 'rgba(255, 255, 255, 0.6)',
            lineHeight: '1.4',
            margin: '0 0 1.25rem'
          }}
        >
          Only one account is allowed per device. Please log in with your existing account or reset your password.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <button
            type="button"
            className="submit-btn slanted-green-btn"
            onClick={() => {
              if (onGoToLogin) onGoToLogin(existingEmail);
              onClose();
            }}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              fontWeight: '900',
              fontSize: '0.82rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              boxShadow: '0 4px 15px rgba(34, 197, 94, 0.35)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem'
            }}
          >
            <i className="fa-solid fa-right-to-bracket"></i>
            <span>LOGIN TO EXISTING ACCOUNT</span>
          </button>

          <div style={{ display: 'flex', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => {
                if (onGoToForgot) onGoToForgot();
                onClose();
              }}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#fff',
                padding: '0.6rem 0.5rem',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Forgot Password?
            </button>

            {onOpenSupport && (
              <button
                type="button"
                onClick={() => {
                  if (onOpenSupport) onOpenSupport();
                  onClose();
                }}
                style={{
                  flex: 1,
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  padding: '0.6rem 0.5rem',
                  borderRadius: '10px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
              >
                <i className="fa-solid fa-headset"></i> Support
              </button>
            )}
          </div>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- C) ADMIN GAME ADD/EDIT MODAL (LOGO UPLOADER INTEGRATED) ---
export function AdminGameModal({ isOpen, onClose, onSave, editGame }) {
  const [title, setTitle] = useState('');
  const [badge, setBadge] = useState('none');
  const [image, setImage] = useState('');
  const [link, setLink] = useState('https://play.jackpotentry.com/game');
  
  const [titleError, setTitleError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editGame) {
        setTitle(editGame.title);
        setBadge(editGame.badge);
        setImage(editGame.image);
        setLink(editGame.link);
      } else {
        setTitle('');
        setBadge('none');
        setImage('');
        setLink('https://play.jackpotentry.com/game');
      }
      setTitleError('');
      setLinkError('');
      setImageError('');
    }
  }, [isOpen, editGame]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setImageError('Logo cover image size must be less than 8MB.');
      e.target.value = '';
      return;
    }

    try {
      const compressed = await compressImageFile(file, { maxSize: 512, quality: 0.72 });
      setImage(compressed);
      setImageError('');
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
        setImageError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    let isValid = true;

    if (title.trim() === '') {
      setTitleError('Game title is required');
      isValid = false;
    }

    if (link.trim() === '') {
      setLinkError('Target play link is required');
      isValid = false;
    }

    if (image.trim() === '') {
      setImageError('Please upload a game cover logo graphic.');
      isValid = false;
    }

    if (isValid) {
      setIsSubmitting(true);
      try {
        await onSave({
          id: editGame ? editGame.id : null,
          title: title.trim(),
          badge,
          image,
          link: link.trim(),
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-plus-circle gold-text"></i>{' '}
            {editGame ? 'Edit Game' : 'Add New Game'}
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} noValidate>
            <div className="input-group">
              <label htmlFor="game-title-input">Game Title</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-gamepad input-icon"></i>
                <input
                  type="text"
                  id="game-title-input"
                  placeholder="e.g. Juwa 2.0"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleError('');
                  }}
                  required
                />
              </div>
              <span className="error-msg">{titleError}</span>
            </div>

            <div className="input-group">
              <label htmlFor="game-badge-select">Badge Type</label>
              <div className="input-wrapper select-wrapper">
                <i className="fa-solid fa-tag input-icon"></i>
                <select
                  id="game-badge-select"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  required
                >
                  <option value="none">None</option>
                  <option value="hot">HOT (Red Badge)</option>
                  <option value="new">NEW (Gold Badge)</option>
                </select>
              </div>
            </div>

            {/* Logo Image Uploader */}
            <div className="input-group">
              <label htmlFor="game-logo-uploader">Upload Game Logo / Graphic</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-image input-icon"></i>
                <input
                  type="file"
                  id="game-logo-uploader"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  style={{ border: 'none', background: 'none', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', padding: '0.4rem 0', width: '100%' }}
                  required={!editGame}
                />
              </div>
              <span className="error-msg">{imageError}</span>
              {image && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '40px', height: '40px', overflow: 'hidden', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={image} alt="Cover Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>Logo selected.</span>
                </div>
              )}
            </div>

            <div className="input-group">
              <label htmlFor="game-link-input">Target Play Link (External URL)</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-link input-icon"></i>
                <input
                  type="url"
                  id="game-link-input"
                  placeholder="e.g. https://play.juwa.org/"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setLinkError('');
                  }}
                  required
                />
              </div>
              <span className="error-msg">{linkError}</span>
            </div>

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              <span>{isSubmitting ? 'SAVING...' : (editGame ? 'UPDATE GAME' : 'SAVE GAME')}</span>
              <div className="btn-glow"></div>
            </button>
          </form>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- D) DYNAMIC CHOOSE PAYMENT METHOD MODAL (MAPPED FROM DATABASES) ---
export function PaymentMethodModal({ isOpen, onClose, amount, gateways = [], onSelectMethod }) {
  if (!isOpen) return null;

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '0.25rem' }}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
            Choose Payment Method
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        
        <div className="modal-body" style={{ padding: '0 1.5rem 1.5rem 1.5rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            Deposit Amount
          </span>
          <h2 style={{ fontSize: '3rem', fontFamily: 'var(--font-heading)', color: '#00d2ff', textShadow: '0 0 15px rgba(0, 210, 255, 0.4)', margin: '0.25rem 0 1.5rem 0', fontWeight: '900' }}>
            ${parseFloat(amount || 0).toFixed(2)}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
            {gateways.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No payment methods available.</p>
            ) : (
              gateways.map((g) => {
                let btnStyle = { background: '#94a3b8' };
                if (g.theme === 'chime') {
                  btnStyle = { background: '#2ecc71' };
                } else if (g.theme === 'cashapp') {
                  btnStyle = { background: '#00d632', color: '#000' };
                } else if (g.theme === 'stripe') {
                  btnStyle = { background: '#635bff' };
                } else if (g.theme === 'crypto') {
                  btnStyle = { background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' };
                } else if (g.theme === 'zelle') {
                  btnStyle = { background: '#7413dc' };
                } else if (g.theme === 'paypal') {
                  btnStyle = { background: '#0079c1' };
                } else if (g.theme === 'venmo') {
                  btnStyle = { background: '#008cff' };
                }

                return (
                  <div key={g.id} className="payment-gateway-option" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-muted)', borderRadius: '14px', padding: '1rem', textAlign: 'left' }}>
                    <h4 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: '700', marginBottom: '0.15rem' }}>{g.name}</h4>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{g.subtitle}</p>
                    <button
                      type="button"
                      className="submit-btn"
                      onClick={() => onSelectMethod(g)}
                      style={{ ...btnStyle, boxShadow: 'none', padding: '0.75rem', marginTop: 0 }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: '900' }}>CONTINUE WITH {g.name.toUpperCase()}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- E) ADMIN APPROVE ACCOUNT REQUEST MODAL ---
export function ApproveAccountModal({ isOpen, onClose, onApprove, requestDetails }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [userError, setUserError] = useState('');
  const [passError, setPassError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && requestDetails && requestDetails.userEmail) {
      const randomSuf = Math.floor(100 + Math.random() * 900);
      const emailStr = requestDetails.userEmail || '';
      const cleanEmail = (emailStr.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      setUsername(`${cleanEmail}${randomSuf}`);
      
      const charSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let randPass = '';
      for (let i = 0; i < 8; i++) {
        randPass += charSet.charAt(Math.floor(Math.random() * charSet.length));
      }
      setPassword(randPass);
      
      setUserError('');
      setPassError('');
    }
  }, [isOpen, requestDetails]);

  if (!isOpen || !requestDetails) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    let isValid = true;
    if (username.trim() === '') {
      setUserError('Username is required');
      isValid = false;
    }
    if (password.trim() === '') {
      setPassError('Password is required');
      isValid = false;
    }

    if (isValid) {
      setIsSubmitting(true);
      try {
        await onApprove({
          requestId: requestDetails?.id || '',
          userEmail: requestDetails?.userEmail || '',
          gameTitle: requestDetails?.gameTitle || '',
          username: username.trim(),
          password: password.trim()
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-user-check gold-text"></i> Approve Game Account
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Allocating a new gaming account for player <strong>{requestDetails?.userEmail || 'Unknown'}</strong> on game <strong>{requestDetails?.gameTitle || 'Unknown'}</strong>.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-group">
              <label htmlFor="allot-username">Login Username</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-user-gear input-icon"></i>
                <input
                  type="text"
                  id="allot-username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setUserError(''); }}
                  required
                />
              </div>
              <span className="error-msg">{userError}</span>
            </div>

            <div className="input-group">
              <label htmlFor="allot-password">Login Password</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-key input-icon"></i>
                <input
                  type="text"
                  id="allot-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPassError(''); }}
                  required
                />
              </div>
              <span className="error-msg">{passError}</span>
            </div>

            <button type="submit" className="submit-btn" style={{ marginTop: '0.5rem' }} disabled={isSubmitting}>
              <span>{isSubmitting ? 'TRANSMITTING...' : 'APPROVE & TRANSMIT'}</span>
              <div className="btn-glow"></div>
            </button>
          </form>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- F) DYNAMIC PAYMENT GATEWAY ADD/EDIT MODAL (QR CODE UPLOADER INTEGRATED) ---
export function AdminGatewayModal({ isOpen, onClose, onSave, editGateway }) {
  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [tag, setTag] = useState('');
  const [phone, setPhone] = useState('');
  const [theme, setTheme] = useState('chime');
  const [qrImage, setQrImage] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  // Withdrawal configurations — default ON so new gateways appear for cashout too
  const [isWithdrawActive, setIsWithdrawActive] = useState(true);
  const [requireNameOnTag, setRequireNameOnTag] = useState(true);
  const [requireTag, setRequireTag] = useState(true);
  const [requirePhoneOnTag, setRequirePhoneOnTag] = useState(true);
  const [requireEmailOnTag, setRequireEmailOnTag] = useState(false);

  const [nameError, setNameError] = useState('');
  const [tagError, setTagError] = useState('');
  const [qrError, setQrError] = useState('');
  const [redirectError, setRedirectError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLinkPayTheme = theme === 'cashapp' || theme === 'stripe';

  useEffect(() => {
    if (isOpen) {
      if (editGateway) {
        setName(editGateway.name);
        setSubtitle(editGateway.subtitle);
        setTag(editGateway.tag);
        setPhone(editGateway.phone);
        setTheme(editGateway.theme);
        setQrImage(editGateway.qrImage);
        setRedirectUrl(editGateway.redirectUrl || '');
        setIsWithdrawActive(editGateway.isWithdrawActive === true);
        setRequireNameOnTag(editGateway.requireNameOnTag !== false);
        setRequireTag(editGateway.requireTag !== false);
        setRequirePhoneOnTag(editGateway.requirePhoneOnTag !== false);
        setRequireEmailOnTag(editGateway.requireEmailOnTag === true);
      } else {
        setName('');
        setSubtitle('');
        setTag('');
        setPhone('');
        setTheme('chime');
        setQrImage('');
        setRedirectUrl('');
        setIsWithdrawActive(false);
        setRequireNameOnTag(true);
        setRequireTag(true);
        setRequirePhoneOnTag(true);
        setRequireEmailOnTag(false);
      }
      setNameError('');
      setTagError('');
      setQrError('');
      setRedirectError('');
    }
  }, [isOpen, editGateway]);

  if (!isOpen) return null;

  const handleQrUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setQrError('QR graphic cover image size must be less than 8MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_size = 350; // High resolution but low payload footprint
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPEG is tiny!
        setQrImage(compressedBase64);
        setQrError('');
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    let isValid = true;

    if (name.trim() === '') {
      setNameError('Gateway Name is required');
      isValid = false;
    }

    if (isLinkPayTheme) {
      if (!redirectUrl.trim()) {
        setRedirectError('Pay redirect URL is required for Cash App / Stripe.');
        isValid = false;
      }
    } else {
      if (tag.trim() === '') {
        setTagError('Payment Tag/Address is required');
        isValid = false;
      }
      if (qrImage.trim() === '') {
        setQrError('Please upload the QR Code Image Graphic.');
        isValid = false;
      }
    }

    if (isValid) {
      setIsSubmitting(true);
      try {
        const safeName = name.trim();
        const safeTag = isLinkPayTheme
          ? (tag.trim() || `${theme}-pay`)
          : tag.trim();
        await onSave({
          id: editGateway ? editGateway.id : null,
          name: safeName,
          subtitle: subtitle.trim(),
          tag: safeTag,
          phone: isLinkPayTheme ? '' : phone.trim(),
          theme,
          qrImage: isLinkPayTheme
            ? ''
            : (qrImage || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(safeName + '-' + safeTag)}`),
          redirectUrl: isLinkPayTheme ? redirectUrl.trim() : redirectUrl.trim(),
          isWithdrawActive,
          requireNameOnTag: isWithdrawActive ? requireNameOnTag : false,
          requireTag: isWithdrawActive ? requireTag : false,
          requirePhoneOnTag: isWithdrawActive ? requirePhoneOnTag : false,
          requireEmailOnTag: isWithdrawActive ? requireEmailOnTag : false
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ overflowY: 'auto', maxHeight: '90vh', maxWidth: '480px', width: '92%' }}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-sliders gold-text"></i>{' '}
            {editGateway ? 'Edit Gateway' : 'Add New Gateway'}
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} noValidate>
            <div className="input-group">
              <label htmlFor="gt-name">Gateway Name</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-wallet input-icon"></i>
                <input
                  type="text"
                  id="gt-name"
                  placeholder="e.g. Cash App, Stripe, Chime"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError(''); }}
                  required
                />
              </div>
              <span className="error-msg">{nameError}</span>
            </div>

            <div className="input-group">
              <label htmlFor="gt-sub">Description subtitle</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-message input-icon"></i>
                <input
                  type="text"
                  id="gt-sub"
                  placeholder="e.g. Pay using Cash App link"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="gt-theme">Button Visual Theme</label>
              <div className="input-wrapper select-wrapper">
                <i className="fa-solid fa-palette input-icon"></i>
                <select
                  id="gt-theme"
                  value={theme}
                  onChange={(e) => {
                    setTheme(e.target.value);
                    setTagError('');
                    setQrError('');
                    setRedirectError('');
                  }}
                  required
                >
                  <option value="chime">Chime Green</option>
                  <option value="cashapp">Cash App</option>
                  <option value="stripe">Stripe</option>
                  <option value="crypto">Crypto Pink-Purple Gradient</option>
                  <option value="zelle">Zelle Purple</option>
                  <option value="paypal">PayPal Blue</option>
                  <option value="venmo">Venmo Cyan</option>
                </select>
              </div>
            </div>

            {isLinkPayTheme ? (
              <div className="input-group">
                <label htmlFor="gt-redirect">Pay Redirect URL (Required)</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-link input-icon"></i>
                  <input
                    type="url"
                    id="gt-redirect"
                    placeholder="e.g. https://cash.app/$YourTag or Stripe payment link"
                    value={redirectUrl}
                    onChange={(e) => { setRedirectUrl(e.target.value); setRedirectError(''); }}
                    required
                  />
                </div>
                <span className="error-msg">{redirectError}</span>
                <span className="game-tap-tip" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  Cash App / Stripe only need this link. No payment tag, phone, or QR. Optional: {'{amount}'} {'{code}'}
                </span>
              </div>
            ) : (
              <>
                <div className="input-group">
                  <label htmlFor="gt-tag">Payment Tag / ID Address</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-at input-icon"></i>
                    <input
                      type="text"
                      id="gt-tag"
                      placeholder="e.g. $MyTag, name@email.com"
                      value={tag}
                      onChange={(e) => { setTag(e.target.value); setTagError(''); }}
                      required
                    />
                  </div>
                  <span className="error-msg">{tagError}</span>
                </div>

                <div className="input-group">
                  <label htmlFor="gt-phone">Linked Phone / Info Details</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-phone input-icon"></i>
                    <input
                      type="text"
                      id="gt-phone"
                      placeholder="e.g. 555-123-4567, USDT TRC20"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Withdrawal CMS Configuration Settings */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', display: 'block' }}>Show for player cashout</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                    ON = this gateway appears in Withdraw. If none are ON, all deposit gateways show for cashout.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isWithdrawActive}
                  onChange={(e) => setIsWithdrawActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold-primary)', flexShrink: 0 }}
                />
              </div>

              {isWithdrawActive && (
                <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderLeft: '2px solid var(--gold-primary)', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Required Payout Fields from Player:</span>
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.725rem', color: '#fff', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={requireNameOnTag}
                      onChange={(e) => setRequireNameOnTag(e.target.checked)}
                      style={{ accentColor: 'var(--gold-primary)' }}
                    />
                    Name on Payout Tag
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.725rem', color: '#fff', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={requireTag}
                      onChange={(e) => setRequireTag(e.target.checked)}
                      style={{ accentColor: 'var(--gold-primary)' }}
                    />
                    Payout Tag/Address ($handle, email, etc.)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.725rem', color: '#fff', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={requirePhoneOnTag}
                      onChange={(e) => setRequirePhoneOnTag(e.target.checked)}
                      style={{ accentColor: 'var(--gold-primary)' }}
                    />
                    Linked Phone Number
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.725rem', color: '#fff', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={requireEmailOnTag}
                      onChange={(e) => setRequireEmailOnTag(e.target.checked)}
                      style={{ accentColor: 'var(--gold-primary)' }}
                    />
                    Email Address
                  </label>
                </div>
              )}
            </div>

            {/* QR Graphic File Uploader — not needed for Cash App / Stripe link pay */}
            {!isLinkPayTheme && (
            <div className="input-group">
              <label htmlFor="gt-qr-uploader">Upload QR Code Image</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-qrcode input-icon"></i>
                <input
                  type="file"
                  id="gt-qr-uploader"
                  accept="image/*"
                  onChange={handleQrUpload}
                  style={{ border: 'none', background: 'none', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', padding: '0.4rem 0', width: '100%' }}
                  required={!editGateway}
                />
              </div>
              <span className="error-msg">{qrError}</span>
              {qrImage && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '40px', height: '40px', overflow: 'hidden', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={qrImage} alt="QR Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>QR Code selected.</span>
                </div>
              )}
            </div>
            )}

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              <span>{isSubmitting ? 'SAVING...' : (editGateway ? 'UPDATE GATEWAY' : 'SAVE GATEWAY')}</span>
              <div className="btn-glow"></div>
            </button>
          </form>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- G) VIEW RECEIPT PROOF MODAL ---
export function ViewProofModal({ isOpen, onClose, proofUrl }) {
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    if (!isOpen) setEnlarged(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(720px, 96vw)', width: '100%', border: '1px solid var(--gold-primary)' }}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-receipt gold-text"></i> Payment Screenshot Receipt
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
          <div style={{ width: '100%', minHeight: '180px', maxHeight: '70vh', overflowY: 'auto', borderRadius: '12px', background: '#090a10', border: '1px solid rgba(255,255,255,0.05)', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {proofUrl ? (
              <img
                src={proofUrl}
                alt="Payment Screenshot Receipt proof"
                onClick={() => setEnlarged(true)}
                title="Click to enlarge"
                style={{ width: '100%', height: 'auto', maxHeight: '68vh', display: 'block', borderRadius: '8px', objectFit: 'contain', cursor: 'zoom-in' }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--gold-primary)', marginBottom: '0.5rem', display: 'block' }}></i>
                <div style={{ fontSize: '0.75rem' }}>Loading receipt proof...</div>
              </div>
            )}
          </div>
          <button type="button" className="submit-btn" onClick={onClose} style={{ marginTop: '0.5rem' }}>
            <span>CLOSE INSPECTOR</span>
          </button>
        </div>
      </div>
    </PanelModalBackdrop>
    {enlarged && proofUrl ? (
      <ImageLightbox src={proofUrl} onClose={() => setEnlarged(false)} alt="Payment screenshot" />
    ) : null}
    </>
  );
}

// --- H) ADJUST BALANCE MODAL ---
export function AdjustBalanceModal({ isOpen, onClose, onAdjust, user }) {
  const [amount, setAmount] = useState('');
  const [adjType, setAdjType] = useState('credit'); // 'credit' | 'debit'
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setAdjType('credit');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentCoins = parseFloat(user.coins || 0);
      const targetCoins = adjType === 'credit' 
        ? currentCoins + amt 
        : Math.max(0, currentCoins - amt);

      await onAdjust(user.email, targetCoins);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to adjust player balance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-scale-unbalanced gold-text"></i> Adjust Player Balance
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Adjusting balance for player <strong style={{ color: '#fff' }}>{user.email}</strong>. <br />
            Current Balance: <strong style={{ color: 'var(--gold-primary)' }}>${parseFloat(user.coins || 0).toFixed(2)}</strong>
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <label style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '0.6rem',
                background: adjType === 'credit' ? 'rgba(34, 197, 94, 0.1)' : '#0c0e17',
                border: adjType === 'credit' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.05)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: adjType === 'credit' ? '#22c55e' : '#fff'
              }}>
                <input
                  type="radio"
                  name="adjType"
                  checked={adjType === 'credit'}
                  onChange={() => setAdjType('credit')}
                  style={{ marginBottom: '0.25rem' }}
                />
                Credit (Add)
              </label>

              <label style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '0.6rem',
                background: adjType === 'debit' ? 'rgba(239, 68, 68, 0.1)' : '#0c0e17',
                border: adjType === 'debit' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: adjType === 'debit' ? '#ef4444' : '#fff'
              }}>
                <input
                  type="radio"
                  name="adjType"
                  checked={adjType === 'debit'}
                  onChange={() => setAdjType('debit')}
                  style={{ marginBottom: '0.25rem' }}
                />
                Debit (Deduct)
              </label>
            </div>

            <div className="input-group" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="adjust-amount">Adjustment Amount ($)</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-coins input-icon"></i>
                <input
                  type="number"
                  id="adjust-amount"
                  placeholder="e.g. 50.00"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setErrorMsg(''); }}
                  required
                />
              </div>
              <span className="error-msg">{errorMsg}</span>
            </div>

            <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }} disabled={isSubmitting}>
              <span>{isSubmitting ? 'UPDATING BALANCE...' : 'CONFIRM ADJUSTMENT'}</span>
              <div className="btn-glow"></div>
            </button>
          </form>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}

// --- I) ADMIN RESET PASSWORD MODAL ---
export function AdminResetPasswordModal({ isOpen, onClose, onReset, user }) {
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (newPassword.trim().length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onReset(user.email, newPassword.trim());
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to update player password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PanelModalBackdrop onClick={onClose}>
      <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-key gold-text"></i> Reset Player Password
          </h3>
          <button type="button" className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Setting a new password for player <strong style={{ color: '#fff' }}>{user.email}</strong>.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="reset-new-password">New Login Password</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-lock input-icon"></i>
                <input
                  type="text"
                  id="reset-new-password"
                  placeholder="Enter new password..."
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setErrorMsg(''); }}
                  required
                />
              </div>
              <span className="error-msg">{errorMsg}</span>
            </div>

            <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }} disabled={isSubmitting}>
              <span>{isSubmitting ? 'SAVING PASSWORD...' : 'OVERWRITE PASSWORD'}</span>
              <div className="btn-glow"></div>
            </button>
          </form>
        </div>
      </div>
    </PanelModalBackdrop>
  );
}
