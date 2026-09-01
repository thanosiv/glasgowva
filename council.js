async function loadCouncilMembers() {
  const container = document.getElementById('council-members');
  if (!container) return;

  const imagesEndpoint = window.siteConfig?.councilApiEndpoint || window.siteConfig?.councilImagesEndpoint;

  if (!imagesEndpoint) {
    container.innerHTML = '<article class="card"><p>Council API is not configured.</p></article>';
    return;
  }

  try {
    const response = await fetch(imagesEndpoint);
    if (!response.ok) {
      throw new Error(`Unable to load council API data (${response.status})`);
    }

    const payload = await response.json();
    const membersPayload = payload?.councilData;
    const imagesPayload = payload;

    const typeGroups = normalizeCouncilTypes(membersPayload);
    if (typeGroups.length === 0) {
      throw new Error('Council data is empty or invalid.');
    }

    const imageMap = new Map();
    const images = Array.isArray(imagesPayload?.images) ? imagesPayload.images : [];
    images.forEach((imageItem) => {
      const key = normalizeMemberKey(imageItem?.memberKey || imageItem?.fileName || '');
      if (!key || !imageItem?.url) return;
      if (!imageMap.has(key)) imageMap.set(key, imageItem.url);
    });

    container.innerHTML = typeGroups.map((group) => {
      const membersHtml = group.members.map((member) => {
        const memberKey = normalizeMemberKey(member.name);
        const imageUrl = imageMap.get(memberKey) || '';
        const contact = [];

        if (member.phone) {
          const cleanPhone = String(member.phone).replace(/[^+0-9]/g, '');
          contact.push(`<span>Phone: <a href="tel:${escapeHtml(cleanPhone)}">${escapeHtml(member.phone)}</a></span>`);
        }
        if (member.email) {
          contact.push(`<span>Email: <a href="mailto:${escapeHtml(member.email)}">${escapeHtml(member.email)}</a></span>`);
        }
        if (member.termDate) {
          contact.push(`<span>Term ends: ${escapeHtml(member.termDate)}</span>`);
        }

        return `
          <article class="card council-card">
            <div class="council-card-image">
              <span class="council-card-initials">${escapeHtml(getInitials(member.name))}</span>
              ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(member.name)}" loading="lazy" onload="this.previousElementSibling.style.display='none'" onerror="this.style.display='none'" />` : ''}
            </div>
            <div class="council-card-content">
              <h3>${escapeHtml(member.name)}</h3>
              <p><strong>${escapeHtml(member.title || 'Member')}</strong></p>
              <div class="council-card-meta">${contact.join('')}</div>
            </div>
          </article>
        `;
      }).join('');

      const membersBlock = membersHtml
        ? `<div class="grid council-grid council-type-members">${membersHtml}</div>`
        : '<article class="card"><p>No members listed yet.</p></article>';

      return `
        <section class="council-type-section" aria-label="${escapeHtml(group.type)}">
          <article class="card council-type-header">
            <h3 style="margin-top:0;">${escapeHtml(group.type)}</h3>
            <p class="council-description-display" style="margin-bottom:0;">${escapeHtml(group.description || 'No description provided.')}</p>
          </article>
          ${membersBlock}
        </section>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = `<article class="card"><p>${escapeHtml(error.message)}</p></article>`;
    console.warn(error);
  }
}

function normalizeCouncilTypes(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const source = payload.types && typeof payload.types === 'object' ? payload.types : payload;
  const groups = [];

  Object.entries(source).forEach(([typeName, typeValue]) => {
    if (!typeValue || typeof typeValue !== 'object') return;

    const description = String(typeValue.description || '').trim();
    const membersContainer = typeValue.members;
    let memberRows = [];

    if (Array.isArray(membersContainer)) {
      memberRows = membersContainer;
    } else if (membersContainer && typeof membersContainer === 'object') {
      if (Array.isArray(membersContainer.member)) {
        memberRows = membersContainer.member;
      } else if (membersContainer.member && typeof membersContainer.member === 'object') {
        memberRows = [membersContainer.member];
      }
    }

    const members = memberRows
      .filter((row) => row && typeof row === 'object')
      .filter((row) => isMemberActive(row.active))
      .map((row) => ({
        name: String(row.name || '').trim(),
        title: String(row.title || row.role || '').trim(),
        phone: String(row.phoneNumber || row.phone || '').trim(),
        email: String(row.email || '').trim(),
        termDate: String(row.termDate || row.termEnd || '').trim()
      }))
      .filter((row) => row.name);

    groups.push({
      type: String(typeName || '').trim() || 'Council Group',
      description,
      members
    });
  });

  return groups;
}

function isMemberActive(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
  }
  if (typeof value === 'number') return value === 1;
  return true;
}

function normalizeMemberKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.addEventListener('DOMContentLoaded', loadCouncilMembers);
