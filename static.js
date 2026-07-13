/**
 * Static pages — about, terms, privacy, emergency (detect page from pathname)
 */
import { t, showToast, navigateTo } from '../store.js';
import { onPageEnter, detectCurrentPageKey } from '../router.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { pageEl } from '../utils.js';

function detectPage() {
  return detectCurrentPageKey();
}

function el(id) { return pageEl(id); }

let staticBound = false;

function renderAbout() {
  const root = el('static-content');
  if (!root) return;
  const buffer = document.createElement('div');
  buffer.innerHTML = `
    <article class="card static-article animate-page-enter">
      <h1>🌿 ${t('about', 'About The Harbor')}</h1>
      <p>The Harbor was designed as a modern, digital sanctuary for sharing, healing, and growing together. We understand that navigating the storms of life can feel isolating. Our mission is to build safe, authentic, and structured environments where you can speak your truth without judgment.</p>
      <p>With secure, server-side content moderation, private/public visibility settings, and localization across multiple languages, captains from all horizons can find shelter here.</p>
      <div class="static-quote">"No captain is meant to sail alone forever."</div>
    </article>
    <section class="card" style="margin-top:var(--space-lg)">
      <h2 style="font-size:var(--text-base);font-weight:900;margin:0 0 0.5rem">✉️ ${t('contact_us', 'Contact Our Port Authority')}</h2>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin:0 0 1rem">Have questions, feedback, or need account assistance? Leave a message below.</p>
      <form id="contact-form">
        <div id="contact-error" class="form-error" hidden></div>
        <div id="contact-success" class="form-success" hidden></div>
        <div style="display:grid;gap:1rem;margin-bottom:1rem">
          <div><label class="label">${t('your_name', 'Your Name')}</label><input class="input" id="contact-name" maxlength="60" required placeholder="Enter your name..."></div>
          <div><label class="label">${t('email_address', 'Email Address')}</label><input class="input" type="email" id="contact-email" maxlength="80" required placeholder="you@example.com"></div>
        </div>
        <label class="label">${t('topic_category', 'Inquiry Category')}</label>
        <select class="select" id="contact-category" style="margin-bottom:1rem">
          <option value="Feedback">💡 General Feedback & Suggestions</option>
          <option value="Technical Support">🔧 Technical Account Support</option>
          <option value="Safety Dispute">🛡️ Content & Moderation Appeal</option>
          <option value="Partnership">🤝 Creative & Community Collaborations</option>
        </select>
        <label class="label">${t('message', 'Message Content')}</label>
        <textarea class="textarea" id="contact-message" rows="4" maxlength="2000" required placeholder="Tell us what's on your mind..." style="margin-bottom:1rem"></textarea>
        <button type="submit" class="btn btn--primary" style="width:100%" id="contact-submit">🚀 Send Message</button>
      </form>
    </section>`;
  buffer.querySelector('#contact-form')?.addEventListener('submit', handleContactSubmit);
  root.replaceChildren(...buffer.childNodes);
}

function renderTerms() {
  const root = el('static-content');
  if (!root) return;
  const buffer = document.createElement('div');
  buffer.innerHTML = `
    <article class="card static-article animate-page-enter">
      <h1>📜 ${t('terms', 'Terms of Service')}</h1>
      <p style="font-size:0.625rem;color:var(--text-muted)">Last updated: July 2026 | Effective immediately upon registration</p>
      
      <h2>1. Acceptance of Conditions</h2>
      <p>By accessing, registering, or contributing to The Harbor platform, you agree to form a binding agreement with our community guidelines and these Terms of Service. If you do not agree, you are prohibited from utilizing the application.</p>
      
      <h2>2. Safe & Acceptable Usage Rules</h2>
      <ul>
        <li><strong>Zero Bullying / Harassment:</strong> Targeting users with abusive comments or hostile content leads to permanent account termination.</li>
        <li><strong>Constructive Responses Only:</strong> Offer empathy, care, or respectful advice.</li>
        <li><strong>Personal Representation:</strong> Do not impersonate other users, clinicians, organizations, or administrators.</li>
      </ul>
      
      <h2>3. Content Ownership & Platform License</h2>
      <p><strong>Your Content is Yours:</strong> You retain full copyright and ownership of any stories, comments, or texts you author on The Harbor. By posting content on our platform, you grant The Harbor a non-exclusive, royalty-free, worldwide, sublicensable license to host, store, display, translate, and distribute your content solely for the purpose of operating, improving, and publicizing the community services.</p>
      
      <h2>4. User Deletion Rights</h2>
      <p>You maintain the absolute right to delete any of your published stories, comments, or your complete user account at any time. Account deletion permanently purges all your profile data from our cloud databases (Firestore) and authentication systems immediately and irreversibly.</p>
  
      <h2>5. Content Safety & Automated AI Moderation</h2>
      <p>To preserve a secure peer-support sanctuary, The Harbor employs automated real-time content moderation. Submissions are scanned by server-side AI tools (e.g. Gemini API) to detect severe harassment, hate speech, graphic/explicit material, or unsafe self-harm details. We reserve the absolute right to flag, hide, or delete submissions that violate safety standards.</p>
  
      <h2>6. Liability Boundaries & Medical Disclaimer</h2>
      <div class="static-disclaimer" style="margin: 1.5rem 0;">
        ⚠️ <strong>CRITICAL CLINICAL DISCLAIMER:</strong> The Harbor is a peer support community. It is NOT a professional clinical, psychiatric, psychological, or medical provider. The services and content are for informational and peer connection purposes only and do not constitute professional advice or treatment. Always consult a licensed medical or mental health professional for serious distress or emergencies.
      </div>
      <p>The Harbor acts solely as a technological host and intermediary for peer support. Under no circumstances shall The Harbor, its volunteers, or its developers be liable for any direct, indirect, incidental, or consequential damages resulting from user contributions or reliance on platform content.</p>
    </article>`;
  root.replaceChildren(...buffer.childNodes);
}

function renderPrivacy() {
  const root = el('static-content');
  if (!root) return;
  const buffer = document.createElement('div');
  buffer.innerHTML = `
    <article class="card static-article animate-page-enter">
      <h1>🔒 ${t('privacy', 'Privacy Policy')}</h1>
      <p style="font-size:0.625rem;color:var(--text-muted)">Last updated: July 2026 | Dedicated to complete transparency</p>
      
      <h2>1. Data We Collect & Purpose</h2>
      <p>We collect and process only the minimal necessary information to safely run the platform, including:</p>
      <ul>
        <li><strong>Account Identifiers:</strong> Your email address, display name, and authentication tokens to verify your identity.</li>
        <li><strong>Optional Profile Data:</strong> Self-declared gender, country, birthday, and biography to customize your profile.</li>
        <li><strong>User-Generated Content:</strong> Stories, comments, and reaction records you actively publish on the platform.</li>
      </ul>
      <p>This data is processed solely to authenticate user logins, host peer sharing, run safety algorithms, and send account alerts.</p>
  
      <h2>2. Data Protection, Storage & Security</h2>
      <p>Your personal data and private logs are stored securely using Firestore with industry-standard server-side access rule enforcement. Security rules strictly prevent unauthorized public access to unapproved or private user settings. We implement administrative and physical security barriers to defend your credentials against unauthorized disclosure.</p>
  
      <h2>3. Digital Privacy Frameworks & GDPR Rights</h2>
      <p>The Harbor is dedicated to international digital safety guidelines and GDPR principles, giving you the right to:</p>
      <ul>
        <li><strong>Right of Access:</strong> See the full list of your profile details and stories.</li>
        <li><strong>Right to Rectification:</strong> Edit your profile details, bio, or stories instantly.</li>
        <li><strong>Right to Erasure (Forget Me):</strong> Instantly delete any comment, story, or permanently delete your entire account, removing all matching documents from our active database.</li>
      </ul>
  
      <h2>4. Cookies & Ad-Tracking Mitigation</h2>
      <ul>
        <li><strong>Zero Commercial Trackers:</strong> No advertising APIs, pixel tracking, or marketing scripts are ever loaded.</li>
        <li><strong>Essential Storage Only:</strong> We use minimal local storage / browser cookies strictly required for active session authentication, theme states, language choice, and story draft backups.</li>
        <li><strong>Zero Data Selling:</strong> Your data is never sold, traded, or monetized for commercial advertising.</li>
      </ul>
  
      <h2>5. Profile Visibility Options</h2>
      <p>You can toggle your profile visibility between Public and Private in your Account Settings. Private profiles restrict access to your follower list and guard your shared index from unverified captains.</p>
    </article>`;
  root.replaceChildren(...buffer.childNodes);
}

function renderEmergency() {
  const root = el('static-content');
  if (!root) return;
  const buffer = document.createElement('div');
  buffer.innerHTML = `
    <article class="card static-article animate-page-enter">
      <div class="emergency-banner"><span style="font-size:2rem">🆘</span>
        <div><h2 style="font-weight:900;font-size:var(--text-sm);text-transform:uppercase;margin:0">Immediate Critical Notice</h2>
          <p style="font-size:var(--text-xs);margin:0.25rem 0 0;opacity:0.9">If you are in crisis or danger, stop reading and reach out to professional resources immediately.</p></div></div>
      <h1 style="color:var(--color-danger);margin-top:var(--space-md)">🚨 ${t('emergency', 'Emergency & Support Resources')}</h1>
      <div class="emergency-grid">
        <div class="emergency-card"><h3>🇺🇸 United States</h3><p style="font-size:var(--text-xs);font-weight:700;margin:0">📞 Call/Text: 988</p><p style="font-size:0.6875rem;color:var(--text-muted);margin:0.25rem 0 0">National Suicide Prevention — 24/7 confidential support.</p></div>
        <div class="emergency-card"><h3>🇪🇺 Europe</h3><p style="font-size:var(--text-xs);font-weight:700;margin:0">📞 Call: 112</p><p style="font-size:0.6875rem;color:var(--text-muted);margin:0.25rem 0 0">Universal European emergency services.</p></div>
        <div class="emergency-card"><h3>🇨🇦 Canada</h3><p style="font-size:var(--text-xs);font-weight:700;margin:0">📞 Call/Text: 988</p><p style="font-size:0.6875rem;color:var(--text-muted);margin:0.25rem 0 0">Suicide Crisis Helpline with specialized responders.</p></div>
        <div class="emergency-card"><h3>🇬🇧 United Kingdom</h3><p style="font-size:var(--text-xs);font-weight:700;margin:0">📞 Call: 111 (NHS) or 999</p><p style="font-size:0.6875rem;color:var(--text-muted);margin:0.25rem 0 0">National Health lines or emergency services.</p></div>
      </div>
      <div class="card" style="text-align:center;margin-top:var(--space-md);font-size:var(--text-xs);color:var(--text-muted)">💙 You are not alone on this voyage. Reach out whenever you need assistance.</div>
    </article>`;
  root.replaceChildren(...buffer.childNodes);
}

async function handleContactSubmit(e) {
  e.preventDefault();
  const nameEl = el('contact-name');
  const emailEl = el('contact-email');
  const msgEl = el('contact-message');
  const catEl = el('contact-category');
  const errEl = el('contact-error');
  const successEl = el('contact-success');
  const submitBtn = el('contact-submit');

  if (!nameEl || !emailEl || !msgEl || !catEl) return;

  const nameTrim = nameEl.value.trim();
  const emailTrim = emailEl.value.trim();
  const msgTrim = msgEl.value.trim();

  if (errEl) errEl.hidden = true;
  if (successEl) successEl.hidden = true;

  if (!nameTrim || !emailTrim || !msgTrim) {
    if (errEl) {
      errEl.textContent = t('all_fields_required', 'All fields are required.');
      errEl.hidden = false;
    }
    return;
  }
  if (!emailTrim.includes('@')) {
    if (errEl) {
      errEl.textContent = t('invalid_email', 'Please provide a valid email address.');
      errEl.hidden = false;
    }
    return;
  }
  if (submitBtn) submitBtn.disabled = true;
  try {
    await addDoc(collection(db, 'feedback'), {
      name: nameTrim, email: emailTrim, category: catEl.value,
      message: msgTrim, createdAt: new Date().toISOString(), status: 'new',
    });
    
    const currentSuccess = el('contact-success');
    if (currentSuccess) {
      currentSuccess.innerHTML = '🎉 Message Submitted Successfully!<br><span style="font-weight:normal;color:var(--text-secondary)">Our team reviews submissions within 24 hours.</span>';
      currentSuccess.hidden = false;
    }
    showToast('✅ Message received! We will respond shortly.', 'success');
    
    const currentName = el('contact-name');
    const currentEmail = el('contact-email');
    const currentMsg = el('contact-message');
    if (currentName) currentName.value = '';
    if (currentEmail) currentEmail.value = '';
    if (currentMsg) currentMsg.value = '';
  } catch (err) {
    const currentErr = el('contact-error');
    if (currentErr) {
      currentErr.textContent = err.message || 'Failed to submit.';
      currentErr.hidden = false;
    }
  } finally {
    const currentSubmit = el('contact-submit');
    if (currentSubmit) currentSubmit.disabled = false;
  }
}

function renderPhilosophy() {
  const root = el('static-content');
  if (!root) return;
  const buffer = document.createElement('div');
  buffer.innerHTML = `
    <article class="card static-article animate-page-enter" style="max-width:38rem;margin:0 auto;line-height:1.8;padding:var(--space-xl)">
      <div style="text-align:center;margin-bottom:var(--space-lg)">
        <span style="font-size:3rem;display:block;margin-bottom:0.5rem">⚓</span>
        <h1 style="font-size:1.75rem;font-weight:900;letter-spacing:-0.03em;margin:0">${t('philosophy_title', 'The Architectural Philosophy')}</h1>
        <p style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-top:0.5rem;font-weight:700">The Sanctuary of the Harbor</p>
      </div>
      <div style="font-size:var(--text-sm);display:flex;flex-direction:column;gap:1.25rem;color:var(--text-secondary)">
        <p><strong>I. The Premise of Our Sanctuary</strong><br>
        In an era dominated by hyper-connected noise, the human experience has become increasingly isolated. Modern social infrastructure is designed to commodify emotion, trading vulnerability for engagement. The Harbor stands in direct opposition to this digital exhaustion. It exists as an autonomous, non-profit digital sanctuary—an elegant engineering answer to a complex social crisis.</p>
        
        <p><strong>II. The Engineering Ethos</strong><br>
        To build a true safe-haven, visual and technical architecture must operate with absolute integrity. We reject the bloated dependencies of modern frameworks, opting instead for a lightweight, native ES6 vanilla runtime. By minimizing computational friction, we deliver near-instantaneous page transitions and fluid navigation. High performance is not merely a technical preference; it is our primary accessibility directive. A vulnerable captain seeking comfort should never be delayed by lag, structural flickering, or rendering overhead.</p>
        
        <p><strong>III. Absolute Security & Autonomy</strong><br>
        True emotional refuge is impossible without absolute privacy. We balance high-speed client-side routing with rigorous, server-side security architectures. Our integrated Firestore security rules and real-time moderation mechanisms ensure that user identities and authored narratives remain fully isolated from public exposure and external scrutiny. There are no tracking scripts, no commercial ad-networks, and no proprietary data monetization pipelines. We operate with structural honesty: your records belong entirely to you, protected by cryptographic isolation and server-side verification.</p>
        
        <p><strong>IV. The Long-Term Vision</strong><br>
        Our goal is to foster an enduring peer-to-peer ecosystem where vulnerable souls can cast anchor without shame. By combining rigorous security policies with a clean, high-contrast, distraction-free aesthetic, we provide a structured space for genuine human connection. Through absolute technical vigilance and design precision, we sustain a lasting port of safety for captains navigating life's most challenging storms.</p>
      </div>
      <div style="margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--color-border);text-align:right">
        <span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--text-muted);display:block;margin-bottom:0.25rem">With absolute vigilance,</span>
        <strong style="font-size:var(--text-base);color:var(--text-primary);display:block;font-weight:900">Warden</strong>
        <span style="font-size:0.75rem;color:var(--text-muted)">July 10, 2026</span>
      </div>
    </article>`;
  root.replaceChildren(...buffer.childNodes);
}

function init() {
  const page = detectPage();
  if (!el('static-content')) return;
  document.title = `${page.charAt(0).toUpperCase() + page.slice(1)} — The Harbor`;
  if (!staticBound) {
    staticBound = true;
    el('back-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      import('../store.js').then(({ getState }) => {
        navigateTo(getState().user ? 'feed' : 'welcome');
      });
    });
  }
  if (page === 'about') renderAbout();
  else if (page === 'philosophy') renderPhilosophy();
  else if (page === 'terms') renderTerms();
  else if (page === 'privacy') renderPrivacy();
  else if (page === 'emergency') renderEmergency();
}

['about', 'philosophy', 'terms', 'privacy', 'emergency'].forEach((key) => onPageEnter(key, init));
