// bot-activity.js – full social simulation with real names, root comments, 1200+ paragraphs
import admin from 'firebase-admin';
import fs from 'fs';

// Parse the service account key from env
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountKey) {
  console.warn('⚠️ Warning: FIREBASE_SERVICE_ACCOUNT environment variable is not set. Bot simulation is skipped.');
  process.exit(0);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountKey);
} catch (err) {
  console.warn('⚠️ Warning: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON string. Bot simulation is skipped.', err);
  process.exit(0);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ---------- Load bot data ----------
let BOT_UIDS = [];
let GENDER_MAP = {};
let NAME_MAP = {};
try {
  const uidData = fs.readFileSync('bot-uids.json', 'utf8');
  BOT_UIDS = JSON.parse(uidData);
  const genderData = fs.readFileSync('bot-genders.json', 'utf8');
  GENDER_MAP = JSON.parse(genderData);
  const nameData = fs.readFileSync('bot-names.json', 'utf8');
  NAME_MAP = JSON.parse(nameData);
  console.log(`🤖 Loaded ${BOT_UIDS.length} bots with gender and name mapping.`);
} catch (err) {
  console.warn('⚠️ Warning: Missing bot-*.json files. Run create-bots.js first. Bot simulation is skipped.');
  process.exit(0);
}

if (BOT_UIDS.length === 0) {
  console.warn('⚠️ Warning: No bot UIDs found. Bot simulation is skipped.');
  process.exit(0);
}

// ---------- Helpers ----------
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getBotForCategory(category) {
  let candidates = BOT_UIDS;
  if (category === 'men') candidates = BOT_UIDS.filter(uid => GENDER_MAP[uid] === 'male');
  else if (category === 'women') candidates = BOT_UIDS.filter(uid => GENDER_MAP[uid] === 'female');
  if (candidates.length === 0) candidates = BOT_UIDS;
  const uid = randomItem(candidates);
  return { uid, name: NAME_MAP[uid] || 'Unknown' };
}

function randomOtherBot(uid) {
  const candidates = BOT_UIDS.filter(u => u !== uid);
  if (!candidates.length) return null;
  const u = randomItem(candidates);
  return { uid: u, name: NAME_MAP[u] || 'Unknown' };
}

// ---------- Reaction emojis ----------
const REACTION_EMOJIS = ['❤️', '🙏', '😢', '💪', '🤗'];

// ---------- Generate 1,200+ story paragraphs ----------
function generateStoryParagraphs() {
  const topics = [
    'anxiety', 'depression', 'grief', 'loss', 'healing', 'recovery',
    'resilience', 'courage', 'hope', 'love', 'friendship', 'family',
    'forgiveness', 'acceptance', 'self-discovery', 'growth', 'change',
    'letting go', 'finding peace', 'overcoming fear', 'self-worth',
    'community', 'connection', 'purpose', 'faith', 'gratitude',
    'vulnerability', 'strength', 'trust', 'patience', 'wisdom',
  ];
  const emotions = [
    'overwhelming', 'quiet', 'fierce', 'gentle', 'burning', 'calm',
    'desperate', 'hopeful', 'raw', 'tender', 'brave', 'tired',
    'eager', 'resigned', 'determined', 'uncertain', 'peaceful',
  ];
  const actions = [
    'i learned', 'i realized', 'i discovered', 'i understood',
    'i accepted', 'i embraced', 'i faced', 'i overcame',
    'i surrendered', 'i fought', 'i walked away', 'i stayed',
    'i asked for help', 'i offered help', 'i listened', 'i spoke',
    'i wrote', 'i cried', 'i laughed', 'i breathed', 'i let go',
  ];
  const outcomes = [
    'and it changed everything',
    'and i found peace',
    'and i grew stronger',
    'and i started healing',
    'and i felt hope again',
    'and i saw the light',
    'and i made peace with it',
    'and i came alive',
    'and i rediscovered myself',
    'and i stopped running',
    'and i started living',
    'and i was free',
  ];
  const reflections = [
    'it taught me that',
    'i now believe that',
    'i’ve come to understand that',
    'the truth is that',
    'what i know now is that',
    'if i could tell my younger self, i would say',
  ];

  const paragraphs = [];
  let count = 0;
  for (const topic of topics) {
    for (const emotion of emotions) {
      for (const action of actions) {
        for (const outcome of outcomes) {
          for (const reflection of reflections) {
            if (count >= 1300) break;
            paragraphs.push(`${reflection} ${action} ${emotion} ${topic} ${outcome}.`);
            count++;
          }
          if (count >= 1300) break;
        }
        if (count >= 1300) break;
      }
      if (count >= 1300) break;
    }
    if (count >= 1300) break;
  }

  const extra = [
    'The journey through depression is like walking through thick fog – you can’t see the path ahead, but you keep moving because you know the sun is still there, even if you can’t see it.',
    'Grief is not a linear process; it is a spiral that visits you at unexpected moments, each time showing you a new layer of love and loss.',
    'Recovery from anxiety isn’t about eliminating fear – it’s about learning to move forward with it, acknowledging its presence but not letting it drive your choices.',
    'I spent years building walls around my heart, convinced that solitude was safer than connection. What I didn’t realize was that the walls also trapped me inside.',
    'Healing is not about becoming a different person; it is about becoming more of who you truly are beneath the scars.',
    'Sometimes the most profound wisdom comes from the quiet moments of simply observing life, without needing to control or fix everything.',
    'The community at The Harbor taught me that being vulnerable is not weakness; it is the ultimate form of courage, because it dares to be seen.',
    'I used to believe that forgiveness meant condoning the wrongs done to me. Now I see it as releasing myself from the prison of resentment.',
    'Every sunrise is a reminder that we are given a new opportunity to choose kindness, for ourselves and for others.',
    'The darkest nights produce the brightest stars – I hold onto that truth when the weight of despair feels too heavy to bear.',
  ];
  paragraphs.push(...extra);

  for (let i = paragraphs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paragraphs[i], paragraphs[j]] = [paragraphs[j], paragraphs[i]];
  }
  console.log(`📚 Generated ${paragraphs.length} story paragraphs.`);
  return paragraphs;
}

const STORY_PARAGRAPHS = generateStoryParagraphs();

// ---------- Titles and categories ----------
const STORY_TITLES = [
  'My journey with anxiety', 'Finding peace in nature', 'A letter to my younger self',
  'How I overcame fear', 'The power of community', 'Learning to forgive',
  'Gratitude changed my life', 'Dealing with loss', 'The day everything changed',
  'A new beginning', 'Why I started writing', 'Lessons from failure',
  'Embracing vulnerability', 'A message of hope', 'The beauty of imperfection',
  'Overcoming self-doubt', 'A story of resilience', 'Finding strength in silence',
  'The gift of friendship', 'What I learned from my darkest days',
  'My path to healing', 'A conversation with myself', 'The art of letting go',
  'Discovering my worth', 'Learning to breathe again', 'The courage to change',
  'Walking through fire', 'Rebuilding my heart', 'The power of saying no',
  'Why I chose to stay', 'A leap of faith', 'From broken to whole',
];
const CATEGORIES = ['struggles', 'fun', 'learning', 'men', 'women'];
const SHORT_COMMENTS = [
  'Thank you for sharing this 🙏', 'I can really relate to this.',
  'You are so strong! 💪', 'This made my day.',
  'Sending love and support ❤️', 'Beautifully written.',
  'Wow, this resonates deeply.', 'Keep going, you are doing great!',
  'I needed to hear this today.', 'Thank you for your honesty.',
  'This gives me hope.', 'I feel seen. Thank you.',
  'You have a gift with words.', 'Courage is contagious – thank you.',
  'I’m in tears. Thank you.', 'This is exactly what I needed.',
];

function generateLongStory() {
  const count = randomInt(4, 7);
  const shuffled = [...STORY_PARAGRAPHS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join('\n\n');
}

// ---------- Create story ----------
async function createStory() {
  const category = randomItem(CATEGORIES);
  const { uid, name } = getBotForCategory(category);
  const title = randomItem(STORY_TITLES);
  const text = generateLongStory();
  const now = new Date().toISOString();

  const isAnonymous = Math.random() < 0.20;
  const authorName = isAnonymous ? 'Anonymous' : name;

  const storyData = {
    authorId: uid,
    userId: uid,
    authorName,
    isAnonymous,
    title,
    text,
    category,
    approved: true,
    visibility: 'public',
    createdAt: now,
    updatedAt: now,
    commentCount: 0,
    totalGold: 0,
    goldReceived: 0,
    reactions: {},
    loveCount: 0,
    likes: 0,
    donations: 0,
    goldDonations: 0,
  };
  const storyRef = db.collection('stories').doc();
  await storyRef.set(storyData);
  
  // Increment story count on user document for live profile metrics
  await db.collection('users').doc(uid).update({
    storyCount: admin.firestore.FieldValue.increment(1)
  }).catch(() => {});

  console.log(`📝 Bot ${name} (${GENDER_MAP[uid]}) posted "${category}" story: "${title}" (Anonymous: ${isAnonymous})`);
  return storyRef.id;
}

// ---------- Reaction ----------
async function addReaction(targetType, targetId, isStory = true) {
  const uid = randomItem(BOT_UIDS);
  const emoji = randomItem(REACTION_EMOJIS);
  const updateData = { [`reactions.${emoji}`]: admin.firestore.FieldValue.increment(1) };
  if (isStory) {
    const docRef = db.collection('stories').doc(targetId);
    await docRef.update(updateData).catch(() => {});
    const snap = await docRef.get().catch(() => {});
    if (snap && snap.exists) {
      const authorId = snap.data().authorId;
      if (authorId) {
        await db.collection('users').doc(authorId).update({
          likesReceived: admin.firestore.FieldValue.increment(1)
        }).catch(() => {});
      }
    }
  } else {
    const docRef = db.collection('comments').doc(targetId);
    await docRef.update(updateData).catch(() => {});
  }
  console.log(`   👍 Bot ${NAME_MAP[uid] || uid} reacted ${emoji}`);
}

// ---------- Comment ----------
async function addComment(storyId) {
  const uid = randomItem(BOT_UIDS);
  const name = NAME_MAP[uid] || 'Unknown';
  const text = randomItem(SHORT_COMMENTS);
  const now = new Date().toISOString();

  const commentData = {
    authorId: uid,
    userId: uid,
    authorName: name,
    isAnonymous: false,
    storyId,
    text,
    createdAt: now,
    replyCount: 0,
    reactions: {},
    approved: true,
  };
  const commentRef = db.collection('comments').doc();
  await commentRef.set(commentData);
  await db.collection('stories').doc(storyId).update({
    commentCount: admin.firestore.FieldValue.increment(1),
  }).catch(() => {});

  // Increment commentCount in user profile metrics
  await db.collection('users').doc(uid).update({
    commentCount: admin.firestore.FieldValue.increment(1)
  }).catch(() => {});

  console.log(`   💬 Bot ${name} commented`);
  return commentRef.id;
}

// ---------- Reply ----------
async function addReply(storyId, parentCommentId) {
  const uid = randomItem(BOT_UIDS);
  const name = NAME_MAP[uid] || 'Unknown';
  const text = randomItem(SHORT_COMMENTS) + ' (reply)';
  const now = new Date().toISOString();

  const replyData = {
    authorId: uid,
    userId: uid,
    authorName: name,
    isAnonymous: false,
    storyId,
    parentId: parentCommentId,
    text,
    createdAt: now,
    replyCount: 0,
    reactions: {},
    approved: true,
  };
  const replyRef = db.collection('comments').doc();
  await replyRef.set(replyData);
  await db.collection('comments').doc(parentCommentId).update({
    replyCount: admin.firestore.FieldValue.increment(1),
  }).catch(() => {});
  await db.collection('stories').doc(storyId).update({
    commentCount: admin.firestore.FieldValue.increment(1),
  }).catch(() => {});

  // Increment commentCount in user profile metrics
  await db.collection('users').doc(uid).update({
    commentCount: admin.firestore.FieldValue.increment(1)
  }).catch(() => {});

  console.log(`      🔄 Bot ${name} replied`);
}

// ---------- Follow ----------
async function followBot(followerUid) {
  const target = randomOtherBot(followerUid);
  if (!target) return;
  await db.collection('users').doc(followerUid).update({
    following: admin.firestore.FieldValue.arrayUnion(target.uid),
  });
  await db.collection('users').doc(target.uid).update({
    followers: admin.firestore.FieldValue.arrayUnion(followerUid),
  });
  console.log(`   👥 Bot ${NAME_MAP[followerUid]} followed ${target.name}`);
}

// ---------- Send Gold ----------
async function sendGold(fromUid, toUid, amount) {
  await db.runTransaction(async (transaction) => {
    const fromRef = db.collection('users').doc(fromUid);
    const toRef = db.collection('users').doc(toUid);
    const fromSnap = await transaction.get(fromRef);
    const toSnap = await transaction.get(toRef);
    if (!fromSnap.exists || !toSnap.exists) return;
    const fromBalance = fromSnap.data().goldBalance || 0;
    const toBalance = toSnap.data().goldBalance || 0;
    if (fromBalance < amount) return;
    transaction.update(fromRef, {
      goldBalance: fromBalance - amount,
      goldGiven: admin.firestore.FieldValue.increment(amount),
    });
    transaction.update(toRef, {
      goldBalance: toBalance + amount,
      goldReceived: admin.firestore.FieldValue.increment(amount),
    });
  });
  console.log(`   💰 Bot ${NAME_MAP[fromUid]} sent ${amount} gold to ${NAME_MAP[toUid]}`);
}

// ---------- Main cycle ----------
async function runBotCycle() {
  console.log('🤖 Bot activity cycle started...');
  
  // Waking up a randomized selection of 1 to 3 bots to dispatch content
  const botWakeupCount = randomInt(1, 3);
  console.log(`🔔 Selecting ${botWakeupCount} randomized bots to wake up...`);

  const activeBotUids = [];
  while (activeBotUids.length < botWakeupCount) {
    const candidate = randomItem(BOT_UIDS);
    if (!activeBotUids.includes(candidate)) {
      activeBotUids.push(candidate);
    }
  }

  const storyIds = [];
  for (const botUid of activeBotUids) {
    const category = randomItem(CATEGORIES);
    const title = randomItem(STORY_TITLES);
    const text = generateLongStory();
    const now = new Date().toISOString();

    const isAnonymous = Math.random() < 0.20;
    const name = NAME_MAP[botUid] || 'Unknown';
    const authorName = isAnonymous ? 'Anonymous' : name;

    const storyData = {
      authorId: botUid,
      userId: botUid,
      authorName,
      isAnonymous,
      title,
      text,
      category,
      approved: true,
      visibility: 'public',
      createdAt: now,
      updatedAt: now,
      commentCount: 0,
      totalGold: 0,
      goldReceived: 0,
      reactions: {},
      loveCount: 0,
      likes: 0,
      donations: 0,
      goldDonations: 0,
      views: randomInt(10, 50),
    };
    const storyRef = db.collection('stories').doc();
    await storyRef.set(storyData);
    
    await db.collection('users').doc(botUid).update({
      storyCount: admin.firestore.FieldValue.increment(1)
    }).catch(() => {});

    console.log(`📝 Woken up Bot ${name} posted "${category}" story: "${title}" (Anonymous: ${isAnonymous})`);
    storyIds.push(storyRef.id);
    await new Promise(r => setTimeout(r, 300));
  }

  for (const storyId of storyIds) {
    const storySnap = await db.collection('stories').doc(storyId).get();
    if (!storySnap.exists) continue;
    const authorUid = storySnap.data().authorId;

    const commentIds = [];
    const commentCount = randomInt(1, 3);
    for (let i = 0; i < commentCount; i++) {
      const cid = await addComment(storyId);
      commentIds.push(cid);
      await new Promise(r => setTimeout(r, 200));
    }

    for (let i = 0; i < randomInt(1, 3); i++) {
      await addReaction('story', storyId, true);
      await new Promise(r => setTimeout(r, 150));
    }

    const goldAmount = randomInt(1, 5);
    const sender = randomOtherBot(authorUid);
    if (sender) {
      await sendGold(sender.uid, authorUid, goldAmount);
      await new Promise(r => setTimeout(r, 200));
    }

    for (const cid of commentIds) {
      if (Math.random() > 0.6) {
        await addReaction('comment', cid, false);
        await new Promise(r => setTimeout(r, 150));
      }
      if (Math.random() > 0.7) {
        await addReply(storyId, cid);
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  const followCount = randomInt(2, 4);
  for (let i = 0; i < followCount; i++) {
    const follower = randomItem(BOT_UIDS);
    await followBot(follower);
    await new Promise(r => setTimeout(r, 150));
  }

  // Simulate passive readers browsing and generating view counts
  try {
    const storiesSnap = await db.collection('stories').limit(20).get();
    if (!storiesSnap.empty) {
      console.log(`👁️ Simulating passive readers browsing existing stories...`);
      const batch = db.batch();
      storiesSnap.docs.forEach(doc => {
        if (Math.random() > 0.4) { // 60% chance to view
          const additionalViews = randomInt(5, 20);
          batch.update(doc.ref, {
            views: admin.firestore.FieldValue.increment(additionalViews)
          });
          console.log(`   👁️ Story ${doc.id} gained +${additionalViews} passive views.`);
        }
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn(`⚠️ Failed to simulate passive views: ${err.message}`);
  }

  console.log('✅ Bot activity cycle completed.');
}

runBotCycle()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bot cycle failed:', err);
    process.exit(1);
  });
