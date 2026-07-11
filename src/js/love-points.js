import { db, doc, collection, increment } from './firebase.js';

export const LOVE_EMOJI = '❤️';

export function isLoveReaction(type) {
  return type === LOVE_EMOJI || type === 'love' || type === 'Love';
}

/**
 * Atomic love-point ledger inside an existing Firestore transaction.
 * Adjusts users.likesReceived and loveLeaderboard/{authorUid}.totalPoints by ±1.
 */
export function applyLovePointsInTransaction(tx, {
  authorUid, authorName, storyId, reactorUid, reactorName, isAdding,
}) {
  if (!authorUid || authorUid === reactorUid) return;

  const delta = isAdding ? 1 : -1;
  const authorRef = doc(db, 'users', authorUid);
  tx.update(authorRef, { likesReceived: increment(delta) });

  const lbRef = doc(db, 'loveLeaderboard', authorUid);
  tx.set(lbRef, {
    userId: authorUid,
    authorId: authorUid,
    userName: authorName || 'Friend',
    totalPoints: increment(delta),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  if (isAdding) {
    tx.set(doc(collection(db, 'loveLeaderboard', authorUid, 'events')), {
      userId: authorUid,
      authorId: authorUid,
      storyId,
      reactorUid,
      reactorName: reactorName || 'Someone',
      points: 1,
      reactionType: 'love',
      createdAt: new Date().toISOString(),
    });
  }
}
