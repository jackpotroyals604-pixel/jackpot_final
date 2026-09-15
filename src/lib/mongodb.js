import { MongoClient } from 'mongodb';

// MongoDB Atlas is the only database source; no local-data fallback.

function getMongoUri() {
  let uri = process.env.MONGODB_URI || '';
  uri = uri.trim();
  if (
    (uri.startsWith('"') && uri.endsWith('"')) ||
    (uri.startsWith("'") && uri.endsWith("'"))
  ) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
}

const MONGODB_URI = getMongoUri();

// Default initial data for seeding
const DEFAULT_SEEDS = {
  users: [
    { name: 'Demo Player', email: 'player@test.com', password: 'password123', role: 'user' }
  ],
  games: [
    { id: '1', title: 'JUWA', badge: 'hot', image: 'game_juwa.png', link: 'https://play.juwa.org/' },
    { id: '2', title: 'GAMEVAULT', badge: 'hot', image: 'game_gamevault.png', link: 'https://play.gamevault.com/' },
    { id: '3', title: 'VEGAS SWEEPS', badge: 'hot', image: 'game_vegassweeps.png', link: 'https://play.vegassweeps.com/' },
    { id: '4', title: 'ULTRAPANDA', badge: 'none', image: 'placeholder_1', link: 'https://play.ultrapanda.com/' },
    { id: '5', title: 'BLUE DRAGON', badge: 'none', image: 'placeholder_2', link: 'https://play.bluedragon.com/' },
    { id: '6', title: 'FIREKIRIN', badge: 'none', image: 'placeholder_3', link: 'https://play.firekirin.com/' }
  ],
  gateways: [
    {
      id: '1',
      name: 'Chime',
      subtitle: 'Fast bank transfer',
      tag: '$Autumn-King-34',
      phone: '3239902704',
      theme: 'chime',
      qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=ChimeTag-Autumn-King-34'
    },
    {
      id: '2',
      name: 'Cash App',
      subtitle: 'Pay using your Cash App',
      tag: '$Autumn-King-34',
      phone: '3239902704',
      theme: 'cashapp',
      redirectUrl: 'https://cash.app/$Autumn-King-34/{amount}',
      qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=CashApp-Autumn-King-34'
    },
    {
      id: '4',
      name: 'Stripe',
      subtitle: 'Pay securely with card via Stripe',
      tag: 'stripe-checkout',
      phone: 'Card payment',
      theme: 'stripe',
      redirectUrl: '',
      qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=Stripe-Checkout'
    },
    {
      id: '3',
      name: 'Crypto',
      subtitle: 'Pay using USDT / crypto wallet',
      tag: '0x71C568971B9c7e73238971a153b8971a153b8971',
      phone: 'USDT (TRC20)',
      theme: 'crypto',
      qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=USDT-0x71C568971B9c7e73238971a153b8971a153b8971'
    }
  ],
  accountRequests: [],
  gameAccounts: [],
  transactions: []
};

const clientOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  connectTimeoutMS: 10000
};

let clientPromise;
let cachedDb;
let databaseReadyPromise;

function createClientPromise() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured. Local database fallback has been removed.');
  }

  const client = new MongoClient(MONGODB_URI, clientOptions);
  return client.connect();
}

function getClientPromise() {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createClientPromise();
    }
    return global._mongoClientPromise;
  }

  if (!clientPromise) {
    clientPromise = createClientPromise();
  }
  return clientPromise;
}

// Seed empty collections once; ensure indexes at most once per process (cold starts stay fast).
async function ensureIndexes(db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ referredBy: 1 });
  await db.collection('users').createIndex({ referralCode: 1 });
  await db.collection('users').createIndex({ distributorId: 1, role: 1 });
  await db.collection('users').createIndex({ agentCode: 1, role: 1 });

  await db.collection('transactions').createIndex({ id: 1 }, { unique: true });
  await db.collection('transactions').createIndex({ userEmail: 1 });
  await db.collection('transactions').createIndex({ status: 1 });
  await db.collection('transactions').createIndex({ type: 1 });
  await db.collection('transactions').createIndex({ userEmail: 1, type: 1, status: 1 });
  await db.collection('transactions').createIndex({ distributorId: 1, status: 1, type: 1 });
  await db.collection('transactions').createIndex({ status: 1, type: 1, date: -1 });
  await db.collection('transactions').createIndex({ date: -1 });
  await db.collection('transactions').createIndex({ status: 1, type: 1, gateway: 1 });

  await db.collection('distributors').createIndex({ id: 1 }, { unique: true });
  await db.collection('distributors').createIndex({ type: 1 });
  await db.collection('distributors').createIndex({ email: 1 });

  await db.collection('agents').createIndex({ agentCode: 1 });
  await db.collection('agents').createIndex({ parentAgentCode: 1 });
  await db.collection('agents').createIndex({ email: 1 });

  await db.collection('accountRequests').createIndex({ distributorId: 1, status: 1 });
  await db.collection('accountRequests').createIndex({ id: 1 }, { unique: true });
  await db.collection('accountRequests').createIndex({ userEmail: 1 });
  await db.collection('accountRequests').createIndex({ status: 1 });
  await db.collection('accountRequests').createIndex({ status: 1, createdAt: -1 });
  await db.collection('accountRequests').createIndex({ status: 1, distributorType: 1, createdAt: -1 });

  await db.collection('coinsNotifications').createIndex({ distributorId: 1, status: 1 });
  await db.collection('coinsNotifications').createIndex({ id: 1 }, { unique: true });
  await db.collection('coinsNotifications').createIndex(
    { transactionId: 1 },
    {
      unique: true,
      partialFilterExpression: { transactionId: { $type: 'string' } }
    }
  );
  await db.collection('coinsNotifications').createIndex({ userEmail: 1 });
  await db.collection('coinsNotifications').createIndex({ status: 1 });
  await db.collection('coinsNotifications').createIndex({ timestamp: -1 });
  await db.collection('coinsNotifications').createIndex({ status: 1, timestamp: -1 });

  await db.collection('campaignRequests').createIndex({ status: 1, createdAt: -1 });

  await db.collection('supportMessages').createIndex({ id: 1 }, { unique: true, sparse: true });
  await db.collection('supportMessages').createIndex({ distributorId: 1, read: 1, senderType: 1 });
  await db.collection('supportMessages').createIndex({ userEmail: 1, timestamp: -1 });
  await db.collection('supportMessages').createIndex({ timestamp: 1 });
  await db.collection('supportMessages').createIndex({ senderType: 1, read: 1, distributorType: 1 });

  await db.collection('gameAccounts').createIndex({ userEmail: 1 });
  await db.collection('gameAccounts').createIndex({ gameTitle: 1 });
  await db.collection('gameAccounts').createIndex({ userEmail: 1, gameTitle: 1 });

  await db.collection('pushSubscriptions').createIndex({ endpoint: 1 }, { unique: true });
  await db.collection('pushSubscriptions').createIndex({ userEmail: 1 });
  await db.collection('pushSubscriptions').createIndex({ audience: 1, distributorId: 1 });

  await db.collection('games').createIndex({ id: 1 }, { unique: true });
  await db.collection('gateways').createIndex({ id: 1 }, { unique: true });
}

async function seedRealMongo(db) {
  try {
    const collections = await db.listCollections().toArray();
    const names = collections.map((collection) => collection.name);

    for (const [key, value] of Object.entries(DEFAULT_SEEDS)) {
      if (!names.includes(key) || (await db.collection(key).countDocuments()) === 0) {
        if (value.length > 0) {
          await db.collection(key).insertMany(value);
          console.log(`[Seed Database] Populated ${key} with defaults in MongoDB Atlas.`);
        }
      }
    }

    if (!global._mongoIndexesEnsured) {
      await ensureIndexes(db);
      global._mongoIndexesEnsured = true;
      console.log('[Seed Database] Database indexes verified and ensured in MongoDB Atlas.');
    }
  } catch (err) {
    console.error('Failed to seed real MongoDB or create indexes:', err);
  }
}

export async function getDb() {
  if (cachedDb) return cachedDb;

  try {
    const mongoClient = await getClientPromise();
    const db = mongoClient.db();

    if (!databaseReadyPromise) {
      databaseReadyPromise = seedRealMongo(db);
    }
    await databaseReadyPromise;

    cachedDb = db;
    return db;
  } catch (err) {
    // Do not permanently cache a rejected connection. A later request can retry
    // after Atlas network access or connectivity is corrected.
    clientPromise = undefined;
    databaseReadyPromise = undefined;
    if (process.env.NODE_ENV === 'development') {
      global._mongoClientPromise = undefined;
    }

    console.error('MongoDB Atlas connection failed. Local fallback is disabled:', err);
    throw err;
  }
}
