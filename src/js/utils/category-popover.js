import { t } from '../store.js';
import { getCategoryIconSvg } from '../utils.js';

const CATEGORY_DETAILS = {
  all: {
    title: 'The Entire Ocean',
    desc: 'Browse all public stories shared across all Harbors of the community.',
    rules: ['Treat everyone with respect.', 'React with compassion.']
  },
  struggles: {
    title: 'Storm Harbor (Struggles)',
    desc: 'Share your current battles, grief, anxieties, and life storms.',
    rules: ['Vulnerability is encouraged.', 'Zero judgment or unhelpful criticism.']
  },
  fun: {
    title: 'Sunny Harbor (Sunny)',
    desc: 'Express gratitude, daily wins, happy moments, and community joys.',
    rules: ['Keep it positive and uplifting.', 'Celebrate each other\'s successes.']
  },
  learning: {
    title: 'Compass Harbor (Compass)',
    desc: 'Share therapeutic insights, life lessons, guidance, and helpful skills.',
    rules: ['Avoid medical advice.', 'Share constructive, evidence-based coping skills.']
  },
  'my-stories': {
    title: 'My Stories',
    desc: 'Your personal collection of shared stories, drafts, and memories.',
    rules: ['Perfect for tracing your own emotional growth.']
  },
  trending: {
    title: t('trending_title', 'Trending Stories'),
    desc: t('trending_desc', 'The most active and highly appreciated stories lighting up the Harbor, sorted by total likes and reactions.'),
    rules: [t('trending_rule1', 'Upvote and react to stories that touch you.'), t('trending_rule2', 'Keep reactions genuine and respectful.')]
  },
  port: {
    title: t('port_title', 'Port Harbor Feed'),
    desc: t('port_desc', 'Your premium curated harbor. This space is reserved exclusively for the absolute best stories from creators you follow, offering deep, sincere narratives rather than simple updates.'),
    rules: [t('port_rule1', 'Support your followed authors deeply.'), t('port_rule2', 'Reflect and comment with absolute sincerity.')]
  },
  men: {
    title: 'Men\'s Harbor',
    desc: 'A specialized, supportive dock for men to share their unique struggles.',
    rules: ['Peer support for men only.', 'Uphold absolute trust and safety.']
  },
  women: {
    title: 'Women\'s Harbor',
    desc: 'A dedicated, safe harbor for women to empower and support each other.',
    rules: ['Peer support for women only.', 'Empowerment and mutual respect.']
  }
};

let currentPopover = null;
let popoverTimeout = null;

export function showCategoryPopover(el, categoryCode) {
  if (popoverTimeout) clearTimeout(popoverTimeout);
  if (currentPopover) {
    currentPopover.remove();
    currentPopover = null;
  }

  const data = CATEGORY_DETAILS[categoryCode];
  if (!data) return;

  const popover = document.createElement('div');
  popover.className = 'category-popover animate-scale-up';
  popover.id = `popover-${categoryCode}`;
  
  // Custom Styles
  popover.style.position = 'fixed';
  popover.style.zIndex = '99999';
  popover.style.background = 'rgba(23, 23, 23, 0.95)';
  popover.style.backdropFilter = 'blur(12px)';
  popover.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  popover.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.7)';
  popover.style.borderRadius = '1.25rem';
  popover.style.padding = '1.25rem';
  popover.style.width = '20rem';
  popover.style.maxWidth = '90vw';
  popover.style.color = '#e5e5e5';
  popover.style.pointerEvents = 'none';
  popover.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  popover.style.boxShadow = '0 0 20px rgba(26, 74, 74, 0.4)';

  const anchorIcon = getCategoryIconSvg('port', '#fbbf24', 12);
  const rulesList = data.rules.map(rule => `<li style="display:flex; align-items:flex-start; gap:0.35rem; margin-bottom:0.25rem;"><span style="flex-shrink:0; margin-top:0.15rem;">${anchorIcon}</span><span>${rule}</span></li>`).join('');

  popover.innerHTML = `
    <div style="font-weight:900; font-size:1rem; margin-bottom:0.5rem; color:#fff; display:flex; align-items:center; gap:0.5rem;">
      ${getCategoryIconSvg(categoryCode, "#fbbf24", 18)}
      <span>${data.title}</span>
    </div>
    <div style="font-size:0.75rem; color:#a3a3a3; line-height:1.5; margin-bottom:0.75rem;">
      ${data.desc}
    </div>
    <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top:0.75rem;">
      <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:#fbbf24; letter-spacing:0.05em; display:block; margin-bottom:0.35rem;">
        ${t('community_rules', 'Community Rules')}
      </span>
      <ul style="list-style:none; padding:0; margin:0; font-size:0.7rem; color:#d4d4d4; display:flex; flex-direction:column; gap:0.25rem;">
        ${rulesList}
      </ul>
    </div>
  `;

  document.body.appendChild(popover);
  currentPopover = popover;

  // Position calculation
  const rect = el.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth || 320;
  const popoverHeight = popover.offsetHeight || 180;

  let top = rect.bottom + 10;
  let left = rect.left + rect.width / 2 - popoverWidth / 2;

  // Bound checks
  if (top + popoverHeight > window.innerHeight) {
    top = rect.top - popoverHeight - 10;
  }
  if (left < 10) {
    left = 10;
  } else if (left + popoverWidth > window.innerWidth - 10) {
    left = window.innerWidth - popoverWidth - 10;
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

export function hideCategoryPopover() {
  if (popoverTimeout) clearTimeout(popoverTimeout);
  popoverTimeout = setTimeout(() => {
    if (currentPopover) {
      currentPopover.classList.add('animate-scale-down');
      currentPopover.style.opacity = '0';
      const pop = currentPopover;
      setTimeout(() => pop.remove(), 200);
      currentPopover = null;
    }
  }, 100);
}

export function hideCategoryPopoverImmediate() {
  if (popoverTimeout) clearTimeout(popoverTimeout);
  if (currentPopover) {
    currentPopover.remove();
    currentPopover = null;
  }
}

// Bind popovers dynamically to list of elements
export function bindCategoryPopovers(elements, getCategoryCode) {
  elements.forEach(el => {
    const show = () => {
      const code = getCategoryCode(el);
      if (code) showCategoryPopover(el, code);
    };
    const hide = () => {
      hideCategoryPopover();
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      show();
    }, { passive: true });
    el.addEventListener('touchend', hide, { passive: true });
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('mouseup', hideCategoryPopoverImmediate);
  document.addEventListener('touchend', hideCategoryPopoverImmediate);
  document.addEventListener('touchmove', hideCategoryPopoverImmediate);
}
