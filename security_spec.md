# Security Specification & Threat Model (TDD)

This document establishes the declarative data invariants and security test cases for The Harbor's Firestore database.

## 1. Core Data Invariants

1. **User Ownership & Identity Invariant**: Users can only create, update, or delete their own profiles.
2. **Admin Privilege Isolation Invariant**: No user can elevate themselves to an Admin. Role modifications can only be performed by existing Admins or via highly restricted processes.
3. **Story Identity Integrity**: The `userId` and `authorId` fields of a story must match the authenticated user's UID on creation and remain immutable.
4. **Approval Immutability**: Normal users cannot approve stories (`approved = true`). Only authorized Admins can modify the approval/moderation states.
5. **Atomic Operations & Counter Integrity**: Relational operations (such as incrementing `commentCount` or `goldReceived`) must only be updated by exactly `+1` / `-1` or proportional transaction amounts; setting arbitrary count values is strictly blocked.
6. **Comment Orphan Prevention**: A comment cannot be created without a valid, pre-existing parent `storyId` in the `stories` collection.
7. **PII Isolation**: Personally identifiable information (like emails, countries, phone numbers) must only be readable by the owner or an Admin.
8. **Temporal Invariant**: The `createdAt` field is immutable and must correspond to `request.time` upon document creation.

---

## 2. The "Dirty Dozen" Vulnerability Payloads

Below are 12 specific payloads representing attempts to violate identity, integrity, and state.

### Payload 1: Unauthenticated Profile Creation (Identity Bypass)
*   **Target**: `/users/user_abc`
*   **Attack Vector**: Attempting to create a user profile when `request.auth` is null.
*   **Rule Defense**: `request.auth != null && userId == request.auth.uid`

### Payload 2: Admin Self-Promotion (Privilege Escalation)
*   **Target**: `/users/attacker_uid`
*   **Attack Vector**: Setting `isAdmin` to `true` during registration/update.
*   **Rule Defense**: `incoming().isAdmin == false || (existing() != null && existing().isAdmin == true) || isAdmin()`

### Payload 3: Story Identity Spoofing (Identity Theft)
*   **Target**: `/stories/story_123`
*   **Attack Vector**: A user with UID `attacker_uid` creating a story with `userId` or `authorId` set to `victim_uid`.
*   **Rule Defense**: `incoming().userId == request.auth.uid && incoming().authorId == request.auth.uid`

### Payload 4: PII Read Leak (Confidentiality Attack)
*   **Target**: `/users/victim_uid`
*   **Attack Vector**: A user with UID `attacker_uid` trying to read another user's private profile information (e.g. `email` or `emergencyNumber`) when that profile is not public.
*   **Rule Defense**: `resource.data.isPublic == true || isOwner(userId) || isAdmin()`

### Payload 5: ID Poisoning / Wallet Exhaustion (Denial of Service)
*   **Target**: `/stories/STORY_ID_THAT_IS_1000_CHARACTERS_LONG_JUNK_CHARACTERS_!!!`
*   **Attack Vector**: Creating a document with a massive or malformed ID to exhaust indexing and trigger wallet cost attacks.
*   **Rule Defense**: `isValidId(storyId)`

### Payload 6: Story Self-Approval Bypass (State Escalation)
*   **Target**: `/stories/story_123`
*   **Attack Vector**: A normal author updating their pending story to set `approved = true`.
*   **Rule Defense**: `incoming().approved == existing().approved || isAdmin()`

### Payload 7: Arbitrary Comment Count Poisoning (Value Poisoning)
*   **Target**: `/stories/story_123`
*   **Attack Vector**: An attacker updating a story's `commentCount` directly to `999999`.
*   **Rule Defense**: `incoming().diff(existing()).affectedKeys().hasOnly(['commentCount']) && incoming().commentCount == existing().commentCount + 1`

### Payload 8: Negative Love Points Hijack (Resource Tampering)
*   **Target**: `/loveLeaderboard/victim_uid`
*   **Attack Vector**: Resetting or reducing someone's totalPoints arbitrarily.
*   **Rule Defense**: `request.resource.data.totalPoints - resource.data.get('totalPoints', 0) in [-1, 1]`

### Payload 9: Fake Gold Transaction (Financial Spoofing)
*   **Target**: `/goldTransactions/tx_456`
*   **Attack Vector**: Creating a transaction with a falsified `fromUid` pointing to a victim's UID to steal their gold balance.
*   **Rule Defense**: `incoming().fromUid == request.auth.uid`

### Payload 10: Shadow Field Injection (Schema Bypass)
*   **Target**: `/suggestions/suggestion_789`
*   **Attack Vector**: Inserting a hidden ghost field `isFeatured: true` or `restricted: false` during suggestion creation.
*   **Rule Defense**: Strict key checks in the `isValidSuggestion` schema helper.

### Payload 11: Orphaned Comment Injection (Referential Integrity Attack)
*   **Target**: `/comments/comment_999`
*   **Attack Vector**: Submitting a comment with a non-existent `storyId` to pollute database integrity.
*   **Rule Defense**: `exists(/databases/$(database)/documents/stories/$(incoming().storyId))`

### Payload 12: System Pinned Comment Tampering (Access Violation)
*   **Target**: `/comments/comment_777`
*   **Attack Vector**: An unauthorized user changing `isPinned` status of a comment they didn't author and don't own.
*   **Rule Defense**: `!incoming().diff(existing()).affectedKeys().hasAny(['isPinned']) || isAdmin() || isStoryOwner`

---

## 3. Test Runner Design

The following structure outlines the automated security tests in `firestore.rules.test.ts` to execute these validations programmatically against the emulator:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('The Harbor Security Rules Unit Tests', () => {
  // Sets up mock contexts for unauthenticated, standard authenticated, and admin accounts
  // Verifies that all "Dirty Dozen" payloads fail with PERMISSION_DENIED
});
```
