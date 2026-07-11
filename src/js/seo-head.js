/** SEO meta block generator — used by build script; HTML files contain static copies. */
export const SEO_PAGES = {
  'index.html': { title: 'Feed — The Harbor', desc: 'Browse community stories, react with love, and find support in The Harbor feed.', keywords: 'feed, stories, community, support, harbor', ogTitle: 'Feed — The Harbor' },
  'welcome.html': { title: 'Welcome — The Harbor', desc: 'Join The Harbor — a safe place to share your story, find support, and heal together.', keywords: 'welcome, join, signup, community, harbor', ogTitle: 'Welcome — The Harbor' },
  'story.html': { title: 'Story — The Harbor', desc: 'Read a community story, comment with compassion, and support the author.', keywords: 'story, comments, support, harbor', ogTitle: 'Story — The Harbor' },
  'profile.html': { title: 'Profile — The Harbor', desc: 'View and manage your Harbor profile, stats, stories, and followers.', keywords: 'profile, user, stats, harbor', ogTitle: 'Profile — The Harbor' },
  'submit.html': { title: 'Share Story — The Harbor', desc: 'Share your story anonymously or publicly with The Harbor community.', keywords: 'submit, share story, anonymous, harbor', ogTitle: 'Share Story — The Harbor' },
  'suggest.html': { title: 'Suggest — The Harbor', desc: 'Suggest features and improvements for The Harbor platform.', keywords: 'suggest, feedback, features, harbor', ogTitle: 'Suggest — The Harbor' },
  'delete-account.html': { title: 'Delete Account — The Harbor', desc: 'Permanently delete your Harbor account and associated data.', keywords: 'delete account, privacy, harbor', ogTitle: 'Delete Account — The Harbor' },
  'admin.html': { title: 'Admin — The Harbor', desc: 'Admin moderation panel for The Harbor community.', keywords: 'admin, moderation, harbor', ogTitle: 'Admin — The Harbor' },
  'admin-bugs.html': { title: 'Bug Fixes — The Harbor', desc: 'Track reported bugs and published fixes for The Harbor.', keywords: 'bugs, fixes, changelog, harbor', ogTitle: 'Bug Fixes — The Harbor' },
  'activity.html': { title: 'Activity — The Harbor', desc: 'Review your likes, comments, and community activity on The Harbor.', keywords: 'activity, likes, comments, harbor', ogTitle: 'Activity — The Harbor' },
  'daily-rewards.html': { title: 'Daily Rewards — The Harbor', desc: 'Claim your daily Harbor Gold rewards and build your streak.', keywords: 'daily rewards, gold, streak, harbor', ogTitle: 'Daily Rewards — The Harbor' },
  'leaderboard.html': { title: 'Leaderboard — The Harbor', desc: 'The Harbor Leaderboard — see the top 100 users by Love and Gold. Compete, support, and celebrate community achievements.', keywords: 'leaderboard, top users, love, gold, rankings, community, harbor', ogTitle: 'Leaderboard — The Harbor' },
  'notifications.html': { title: 'Notifications — The Harbor', desc: 'Stay updated with likes, comments, gold, and follow notifications.', keywords: 'notifications, alerts, harbor', ogTitle: 'Notifications — The Harbor' },
  'transactions.html': { title: 'Transactions — The Harbor', desc: 'View your Harbor Gold transaction history and donations.', keywords: 'transactions, gold, donations, harbor', ogTitle: 'Transactions — The Harbor' },
  'about.html': { title: 'About — The Harbor', desc: 'Learn about The Harbor mission, values, and community guidelines.', keywords: 'about, mission, community, harbor', ogTitle: 'About — The Harbor' },
  'terms.html': { title: 'Terms of Service — The Harbor', desc: 'The Harbor Terms of Service and community usage rules.', keywords: 'terms, service, rules, harbor', ogTitle: 'Terms — The Harbor' },
  'privacy.html': { title: 'Privacy Policy — The Harbor', desc: 'The Harbor Privacy Policy — how we protect your data.', keywords: 'privacy, policy, data, harbor', ogTitle: 'Privacy — The Harbor' },
  'emergency.html': { title: 'Emergency — The Harbor', desc: 'Emergency helpline numbers and crisis resources worldwide.', keywords: 'emergency, crisis, helpline, harbor', ogTitle: 'Emergency — The Harbor' },
  'donate.html': { title: 'Keep The Harbor Afloat — The Harbor', desc: 'Support The Harbor community — help us keep the safe place afloat for captains worldwide.', keywords: 'donate, support, harbor, mental health, community', ogTitle: 'Support Us — The Harbor' },
};

export function buildSeoHead(filename) {
  const p = SEO_PAGES[filename] || SEO_PAGES['index.html'];
  const base = 'https://the-harbor-community.github.io/theharbor/';
  const url = `${base}${filename}`;
  return `
  <meta name="description" content="${p.desc}" />
  <meta name="keywords" content="${p.keywords}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="author" content="The Harbor Team" />
  <meta name="theme-color" content="#1a4a4a" />
  <link rel="manifest" href="manifest.json" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚓</text></svg>">
  <link rel="canonical" href="${url}" />
  <link rel="alternate" hreflang="x-default" href="${base}${filename}" />
  <link rel="alternate" hreflang="en" href="${url}" />
  <link rel="alternate" hreflang="es" href="${base}${filename.replace('.html', '-es.html')}" />
  <link rel="alternate" hreflang="fr" href="${base}${filename.replace('.html', '-fr.html')}" />
  <meta property="og:title" content="${p.ogTitle}" />
  <meta property="og:description" content="${p.desc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The Harbor" />
  <meta property="og:image" content="${base}og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The Harbor — Safe and Supportive Anonymous Community" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:locale:alternate" content="es_ES" />
  <meta property="og:locale:alternate" content="fr_FR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${p.ogTitle}" />
  <meta name="twitter:description" content="${p.desc}" />
  <meta name="twitter:image" content="${base}og-image.png" />
  <meta name="twitter:image:alt" content="The Harbor — Safe and Supportive Anonymous Community" />
  <meta name="twitter:creator" content="@TheHarborTeam" />
  <meta name="twitter:site" content="@TheHarborTeam" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://www.gstatic.com https://*.firebaseio.com https://www.googletagmanager.com https://www.google-analytics.com 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://accounts.google.com https://*.google.com https://*.firebaseapp.com https://*.firebaseio.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://www.gstatic.com https://translate.googleapis.com https://accounts.google.com https://identitytoolkit.googleapis.com; img-src 'self' data: https:;" />`;
}
