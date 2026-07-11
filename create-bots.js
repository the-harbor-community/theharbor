// create-bots.js – run ONCE to create 20 bots (10 male, 10 female)
import admin from 'firebase-admin';
import fs from 'fs';

// Parse the service account key from env
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountKey) {
  console.error('❌ Error: FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountKey);
} catch (err) {
  console.error('❌ Error: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON string.', err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
const auth = admin.auth();

const BOT_USERS = [
  { firstName: 'Emma', lastName: 'Johnson', gender: 'female', country: 'USA', avatar: '🦊', status: 'Embracing quiet moments of self-discovery.' },
  { firstName: 'Liam', lastName: 'Smith', gender: 'male', country: 'UK', avatar: '🦁', status: 'Finding strength through shared connection.' },
  { firstName: 'Olivia', lastName: 'Williams', gender: 'female', country: 'Canada', avatar: '🐰', status: 'Here to listen, support, and grow.' },
  { firstName: 'Noah', lastName: 'Brown', gender: 'male', country: 'Australia', avatar: '🐨', status: 'Weathering the storm, one day at a time.' },
  { firstName: 'Ava', lastName: 'Jones', gender: 'female', country: 'USA', avatar: '🐼', status: 'Grateful for every sunrise and second chance.' },
  { firstName: 'James', lastName: 'Garcia', gender: 'male', country: 'Mexico', avatar: '🐯', status: 'Learning to let go of what I cannot control.' },
  { firstName: 'Isabella', lastName: 'Miller', gender: 'female', country: 'USA', avatar: '🦄', status: 'Vulnerability is my superpower.' },
  { firstName: 'Oliver', lastName: 'Davis', gender: 'male', country: 'UK', avatar: '🦅', status: 'Rebuilding and finding peace in simple things.' },
  { firstName: 'Sophia', lastName: 'Rodriguez', gender: 'female', country: 'Spain', avatar: '🌸', status: 'Healing is not linear, but it is beautiful.' },
  { firstName: 'Ethan', lastName: 'Martinez', gender: 'male', country: 'USA', avatar: '🐙', status: 'Fighter. Survivor. Believer in community.' },
  { firstName: 'Mia', lastName: 'Hernandez', gender: 'female', country: 'Mexico', avatar: '🐱', status: 'A quiet harbor for turbulent thoughts.' },
  { firstName: 'Alexander', lastName: 'Lopez', gender: 'male', country: 'USA', avatar: '🐺', status: 'Walking the path of recovery with patience.' },
  { firstName: 'Charlotte', lastName: 'Gonzalez', gender: 'female', country: 'Argentina', avatar: '🦋', status: 'Transforming sorrow into strength.' },
  { firstName: 'Daniel', lastName: 'Wilson', gender: 'male', country: 'UK', avatar: '🦊', status: 'Quiet reflections on a noisy world.' },
  { firstName: 'Amelia', lastName: 'Anderson', gender: 'female', country: 'USA', avatar: '🐧', status: 'Breathe in, breathe out. Keep moving.' },
  { firstName: 'Henry', lastName: 'Thomas', gender: 'male', country: 'USA', avatar: '🦁', status: 'Honest stories from the heart.' },
  { firstName: 'Ella', lastName: 'Taylor', gender: 'female', country: 'UK', avatar: '🦄', status: 'Seeking truth and warmth in connection.' },
  { firstName: 'Benjamin', lastName: 'Moore', gender: 'male', country: 'USA', avatar: '🐨', status: 'Sharing light in the darker corridors of life.' },
  { firstName: 'Harper', lastName: 'Jackson', gender: 'female', country: 'Canada', avatar: '🐼', status: 'Navigating life’s seas with absolute vigilance.' },
  { firstName: 'Samuel', lastName: 'Martin', gender: 'male', country: 'France', avatar: '🐬', status: 'Peace, perspective, and personal growth.' },
  { firstName: 'Lucas', lastName: 'Thompson', gender: 'male', country: 'USA', avatar: '🦅', status: 'Casting anchor after a long voyage.' },
  { firstName: 'Evelyn', lastName: 'White', gender: 'female', country: 'UK', avatar: '🦉', status: 'Finding wisdom in the quiet midnight hours.' },
  { firstName: 'Mason', lastName: 'Harris', gender: 'male', country: 'USA', avatar: '🐺', status: 'Rebuilding piece by piece.' },
  { firstName: 'Evelyn', lastName: 'Martin', gender: 'female', country: 'Canada', avatar: '🍁', status: 'Warmth and empathy are my anchors.' },
  { firstName: 'Logan', lastName: 'Clark', gender: 'male', country: 'Australia', avatar: '🐨', status: 'Listening with intent. Sharing with heart.' },
  { firstName: 'Sofia', lastName: 'Lewis', gender: 'female', country: 'USA', avatar: '🦢', status: 'Grace through every transition.' },
  { firstName: 'Alexander', lastName: 'Walker', gender: 'male', country: 'UK', avatar: '🦊', status: 'Looking forward to clearer horizons.' },
  { firstName: 'Avery', lastName: 'Young', gender: 'female', country: 'USA', avatar: '🐿️', status: 'Collecting small moments of gratitude.' },
  { firstName: 'Jacob', lastName: 'Hall', gender: 'male', country: 'USA', avatar: '🐻', status: 'Quiet strength for heavy days.' },
  { firstName: 'Abigail', lastName: 'Allen', gender: 'female', country: 'USA', avatar: '🕊️', status: 'Casting hope into the breeze.' },
  { firstName: 'Michael', lastName: 'Wright', gender: 'male', country: 'UK', avatar: '🦁', status: 'Never sail alone. We are in this together.' },
  { firstName: 'Emily', lastName: 'King', gender: 'female', country: 'UK', avatar: '🌺', status: 'Nurturing growth and patient healing.' },
  { firstName: 'Elijah', lastName: 'Wright', gender: 'male', country: 'USA', avatar: '🦅', status: 'Rising above the noisy currents.' },
  { firstName: 'Elizabeth', lastName: 'Lopez', gender: 'female', country: 'USA', avatar: '🦋', status: 'Beautiful horizons lie ahead.' },
  { firstName: 'Daniel', lastName: 'Hill', gender: 'male', country: 'Canada', avatar: '🐺', status: 'Steering my ship towards peaceful shores.' },
  { firstName: 'Sofia', lastName: 'Scott', gender: 'female', country: 'USA', avatar: '🌸', status: 'Spreading light, one story at a time.' },
  { firstName: 'Matthew', lastName: 'Green', gender: 'male', country: 'USA', avatar: '🌲', status: 'Rooted and resilient.' },
  { firstName: 'Madison', lastName: 'Adams', gender: 'female', country: 'USA', avatar: '🐨', status: 'Empathy is the bridge that connects us all.' },
  { firstName: 'Jackson', lastName: 'Baker', gender: 'male', country: 'Australia', avatar: '🦈', status: 'Surviving deep waters and finding peace.' },
  { firstName: 'Grace', lastName: 'Nelson', gender: 'female', country: 'USA', avatar: '🕊️', status: 'A gentle beacon of hope in the darkness.' },
];

function createCompliantRegisterPayload({ uid, name, email, gender, country, favorites, emergencyNumber, language, birthday, status }) {
  return {
    uid,
    authorId: uid,
    userId: uid,
    name,
    email,
    gender: gender || '🙅 Prefer not to say',
    favorites: favorites || '',
    country: country || '',
    emergencyNumber: emergencyNumber || '',
    emailVerified: false,
    isAdmin: false,
    isPublic: true,
    goldBalance: 100,
    goldReceived: 0,
    goldGiven: 0,
    followers: [],
    following: [],
    storyCount: 0,
    commentCount: 0,
    likesReceived: 0,
    language: language || 'en',
    avatar: '👤',
    border: 'default',
    birthday: birthday || '',
    status: status || '',
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

async function createBots() {
  const botUids = [];
  const genderMap = {};
  const nameMap = {};

  for (const bot of BOT_USERS) {
    const email = `${bot.firstName.toLowerCase()}.${bot.lastName.toLowerCase()}@theharbor.com`;
    const name = `${bot.firstName} ${bot.lastName}`;
    try {
      let uid;
      try {
        const userRecord = await auth.getUserByEmail(email);
        uid = userRecord.uid;
        console.log(`✅ User already exists: ${name} (${uid})`);
      } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
        const userRecord = await auth.createUser({
          email,
          emailVerified: true,
          password: 'BotPassword123!',
          displayName: name,
        });
        uid = userRecord.uid;
        console.log(`✅ Created new bot: ${name} (${uid})`);
      }

      const payload = createCompliantRegisterPayload({
        uid,
        name,
        email,
        gender: bot.gender,
        country: bot.country,
        favorites: '',
        emergencyNumber: '',
        language: 'en',
        birthday: '',
        status: bot.status || '',
      });
      payload.emailVerified = true;
      if (bot.avatar) payload.avatar = bot.avatar;

      await db.collection('users').doc(uid).set(payload, { merge: true });
      console.log(`   📄 Firestore doc created/updated for ${name}`);

      botUids.push(uid);
      genderMap[uid] = bot.gender;
      nameMap[uid] = name;   // store the full name
    } catch (err) {
      console.error(`❌ Failed to process bot ${name}:`, err.message);
    }
  }

  fs.writeFileSync('bot-uids.json', JSON.stringify(botUids, null, 2));
  fs.writeFileSync('bot-genders.json', JSON.stringify(genderMap, null, 2));
  fs.writeFileSync('bot-names.json', JSON.stringify(nameMap, null, 2));
  console.log(`✅ ${botUids.length} bots processed. UIDs, gender, and names saved.`);
}

createBots().then(() => process.exit(0));
