(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const STORAGE_KEY = 'cuongnote_web_v1';
  const PROJECT_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#2dd4bf'];

  const ICONS = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const fold = (value) => String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const pad = (number) => String(number).padStart(2, '0');

  function nowString() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function shortDate(value) {
    return String(value || '').replace('T', ' ').slice(0, 16);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.projects) && Array.isArray(parsed.notes)) return parsed;
      }
    } catch (error) {
      console.warn('Không đọc được dữ liệu đã lưu:', error);
    }
    const seed = window.SEED_DATA || { projects: [], notes: [] };
    return {
      projects: seed.projects.map((project) => ({ ...project })),
      notes: seed.notes.map((note) => ({
        ...note,
        images: (note.images || []).map((image) => ({ ...image }))
      }))
    };
  }

  let state = loadState();
  let ui = {
    selectedProjectId: null,
    selectedNoteId: null,
    query: '',
    editingId: null,
    draftImages: [],
    confirmAction: null
  };

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      toast('Bộ nhớ trình duyệt đầy. Hãy bớt ảnh đính kèm hoặc xuất dữ liệu để sao lưu.', true);
    }
  }

  function toast(message, isError) {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 3000);
  }

  function nextNoteId() {
    return state.notes.reduce((max, note) => Math.max(max, Number(note.id) || 0), 0) + 1;
  }

  function projectName(id) {
    const project = state.projects.find((item) => String(item.id) === String(id));
    return project ? project.name : 'Chung';
  }

  function projectColor(id) {
    const index = state.projects.findIndex((item) => String(item.id) === String(id));
    return PROJECT_COLORS[(index < 0 ? 0 : index) % PROJECT_COLORS.length];
  }

  function imageSrc(image) {
    const raw = image.url || image.file_path || '';
    if (/^(https?:|data:|assets\/)/i.test(raw)) return raw;
    const filename = String(raw).split(/[\\/]/).pop();
    return 'assets/images/' + encodeURIComponent(filename);
  }

  function filteredNotes() {
    const query = fold(ui.query.trim());
    return state.notes
      .filter((note) => ui.selectedProjectId === null || String(note.project_id) === String(ui.selectedProjectId))
      .filter((note) => {
        if (!query) return true;
        const haystack = fold([note.title, note.raw_content, note.tags, projectName(note.project_id)].join(' '));
        return haystack.includes(query);
      })
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

  function renderProjects() {
    const all = `<button class="project-item ${ui.selectedProjectId === null ? 'active' : ''}" data-project="">
      <span class="project-dot" style="background:#38bdf8;color:#38bdf8"></span>
      <span class="project-name">Tất cả ghi chú</span>
      <span class="project-count">${state.notes.length}</span>
    </button>`;

    const items = state.projects.map((project, index) => {
      const count = state.notes.filter((note) => String(note.project_id) === String(project.id)).length;
      const color = PROJECT_COLORS[index % PROJECT_COLORS.length];
      return `<button class="project-item ${String(ui.selectedProjectId) === String(project.id) ? 'active' : ''}" data-project="${esc(project.id)}">
        <span class="project-dot" style="background:${color};color:${color}"></span>
        <span class="project-name">${esc(project.name)}</span>
        <span class="project-count">${count}</span>
      </button>`;
    }).join('');

    $('#projectList').innerHTML = all + items;
  }

  function renderNotes() {
    const notes = filteredNotes();
    const title = ui.selectedProjectId === null
      ? 'Tất cả ghi chú'
      : projectName(ui.selectedProjectId);

    $('#listTitle').textContent = ui.query.trim() ? 'Kết quả tìm kiếm' : title;
    $('#countBadge').textContent = `${notes.length} ghi chú`;

    if (!notes.length) {
      $('#noteList').innerHTML = `<div class="empty-list">
        <div class="empty-icon">📝</div>
        <p>Không có ghi chú nào.<br>Nhấn <b>Ghi chú mới</b> để bắt đầu lưu lại cách xử lý lỗi.</p>
      </div>`;
      return;
    }

    $('#noteList').innerHTML = notes.map((note, index) => {
      const snippet = String(note.raw_content || '').replace(/\s+/g, ' ').trim();
      const tags = String(note.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 2);
      return `<article class="note-card ${ui.selectedNoteId === note.id ? 'active' : ''}"
          data-id="${esc(note.id)}" tabindex="0" style="--i:${Math.min(index, 14)}">
        <div class="note-card-top">
          <span class="project-tag">${esc(projectName(note.project_id))}</span>
          ${tags.map((tag) => `<span class="mini-tag">${esc(tag)}</span>`).join('')}
          <button class="card-edit" data-edit="${esc(note.id)}" title="Sửa ghi chú" aria-label="Sửa ghi chú">${ICONS.edit}</button>
        </div>
        <h3>${esc(note.title || 'Không có tiêu đề')}</h3>
        <p>${esc(snippet) || 'Chưa có nội dung'}</p>
        <div class="card-foot"><span class="note-card-date">🕒 ${esc(shortDate(note.created_at))}</span></div>
      </article>`;
    }).join('');
  }

  function renderDetail() {
    const pane = $('#detailPane');
    const note = state.notes.find((item) => item.id === ui.selectedNoteId);

    if (!note) {
      pane.innerHTML = `<div class="detail-inner"><div class="detail-empty">
        <div class="empty-orb">📒</div>
        <h2>Chọn một ghi chú để xem chi tiết</h2>
        <p>Các ghi chú ở bên trái giúp bạn tra cứu nhanh cách khắc phục lỗi. Nhấn <b>Ghi chú mới</b> để lưu thêm kinh nghiệm xử lý.</p>
      </div></div>`;
      return;
    }

    const paragraphs = String(note.raw_content || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    const contentHtml = paragraphs.length
      ? paragraphs.map((part) => `<p>${esc(part)}</p>`).join('')
      : '<p>Chưa có nội dung.</p>';

    const images = note.images || [];
    const imageHtml = images.length ? `<div class="section-card">
      <div class="section-label">🖼️ ẢNH ĐÍNH KÈM (${images.length})</div>
      <div class="image-grid">${images.map((image) => {
        const src = imageSrc(image);
        return `<button class="image-tile" data-src="${esc(src)}" aria-label="Phóng to ảnh">
          <img src="${esc(src)}" alt="${esc(image.filename || 'Ảnh đính kèm')}" loading="lazy">
        </button>`;
      }).join('')}</div>
    </div>` : '';

    const tags = String(note.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);

    pane.innerHTML = `<div class="detail-inner">
      <div class="action-bar">
        <button class="back-btn" id="backBtn" aria-label="Quay lại danh sách">←</button>
        <button class="btn btn-primary btn-sm" id="editNoteBtn">${ICONS.edit}<span>Sửa</span></button>
        <button class="btn btn-ghost btn-sm" id="copyNoteBtn">${ICONS.copy}<span>Sao chép</span></button>
        <span class="spacer"></span>
        <button class="btn btn-danger btn-sm" id="deleteNoteBtn">${ICONS.trash}<span>Xóa</span></button>
      </div>

      <div class="hero-card">
        <h2>${esc(note.title || 'Không có tiêu đề')}</h2>
        <div class="meta-row">
          <span class="meta-pill">📂 ${esc(projectName(note.project_id))}</span>
          ${tags.length ? `<span class="meta-pill green">🏷️ ${tags.map(esc).join(' · ')}</span>` : ''}
          <span class="meta-plain">Cập nhật ${esc(shortDate(note.updated_at))}</span>
        </div>
      </div>

      <div class="section-card">
        <div class="section-label">📝 NỘI DUNG GHI CHÚ</div>
        <div class="note-content">${contentHtml}</div>
      </div>
      ${imageHtml}
    </div>`;

    $('#backBtn').addEventListener('click', () => $('#workspace').classList.remove('show-detail'));
    $('#editNoteBtn').addEventListener('click', () => openEditor(note.id));
    $('#copyNoteBtn').addEventListener('click', () => copyNote(note));
    $('#deleteNoteBtn').addEventListener('click', () => askDelete(note));
    pane.querySelectorAll('.image-tile').forEach((tile) => {
      tile.addEventListener('click', () => openLightbox(tile.dataset.src));
    });
  }

  function renderAll() {
    renderProjects();
    renderNotes();
    renderDetail();
  }

  function selectNote(id) {
    ui.selectedNoteId = id;
    renderNotes();
    renderDetail();
    $('#workspace').classList.add('show-detail');
    if (window.matchMedia('(max-width: 900px)').matches) {
      $('#detailPane').scrollTop = 0;
    }
  }

  function copyNote(note) {
    const text = `LỖI: ${note.title}\nDỰ ÁN: ${projectName(note.project_id)}\n\nNỘI DUNG:\n${note.raw_content || ''}`;
    const done = () => toast('Đã sao chép nội dung ghi chú.');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (error) { toast('Không thể sao chép.', true); }
    area.remove();
  }

  function askConfirm(title, text, okLabel, action) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okLabel;
    ui.confirmAction = action;
    $('#confirmOverlay').hidden = false;
  }

  function askDelete(note) {
    askConfirm('Xóa ghi chú này?', `“${note.title}” sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.`, 'Xóa', () => {
      state.notes = state.notes.filter((item) => item.id !== note.id);
      saveState();
      if (ui.selectedNoteId === note.id) {
        const remaining = filteredNotes();
        ui.selectedNoteId = remaining.length ? remaining[0].id : null;
      }
      renderAll();
      toast('Đã xóa ghi chú.');
    });
  }

  function renderImagePreview() {
    $('#imagePreview').innerHTML = ui.draftImages.map((image, index) => `
      <div class="preview-item">
        <img src="${esc(image.src || image.url || '')}" alt="${esc(image.filename || 'ảnh')}">
        <button class="preview-remove" data-index="${index}" aria-label="Bỏ ảnh">×</button>
      </div>`).join('');
  }

  function openEditor(id) {
    const note = id == null ? null : state.notes.find((item) => item.id === id);
    ui.editingId = note ? note.id : null;

    $('#editorTitle').textContent = note ? 'Sửa ghi chú' : 'Ghi chú mới';
    $('#editorKicker').textContent = note ? 'CẬP NHẬT GHI CHÚ' : 'GHI CHÚ LỖI';
    $('#fieldTitle').value = note ? note.title || '' : '';
    $('#fieldTags').value = note ? note.tags || '' : '';
    $('#fieldContent').value = note ? note.raw_content || '' : '';

    const options = state.projects.length
      ? state.projects.map((project) => `<option value="${esc(project.id)}">${esc(project.name)}</option>`).join('')
      : '<option value="">Chung</option>';
    $('#fieldProject').innerHTML = options;
    const projectId = note ? note.project_id : ui.selectedProjectId;
    $('#fieldProject').value = projectId == null ? '' : String(projectId);

    ui.draftImages = note
      ? (note.images || []).map((image) => ({ filename: image.filename || '', src: imageSrc(image) }))
      : [];
    renderImagePreview();

    $('#editorOverlay').hidden = false;
    setTimeout(() => $('#fieldTitle').focus(), 60);
  }

  function closeEditor() {
    $('#editorOverlay').hidden = true;
    ui.editingId = null;
    ui.draftImages = [];
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được ảnh'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Ảnh không hợp lệ'));
        img.onload = () => {
          const maxSize = 1400;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    try {
      for (const file of files) {
        const src = await compressImage(file);
        ui.draftImages.push({ filename: file.name, src });
      }
      renderImagePreview();
      toast(`Đã thêm ${files.length} ảnh.`);
    } catch (error) {
      toast('Không thể xử lý ảnh này.', true);
    }
  }

  function openLightbox(src) {
    if (!src) return;
    $('#lightboxImg').src = src;
    $('#lightbox').hidden = false;
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    $('#lightboxImg').removeAttribute('src');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cuongnote-backup.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Đã xuất dữ liệu ra file JSON.');
  }

  // ---------- Events ----------
  $('#newNoteBtn').addEventListener('click', () => openEditor());

  $('#projectList').addEventListener('click', (event) => {
    const button = event.target.closest('.project-item');
    if (!button) return;
    ui.selectedProjectId = button.dataset.project === '' ? null : Number(button.dataset.project);
    const notes = filteredNotes();
    ui.selectedNoteId = notes.length ? notes[0].id : null;
    renderProjects();
    renderNotes();
    renderDetail();
  });

  let searchTimer;
  $('#searchInput').addEventListener('input', (event) => {
    if (event.isComposing) return;
    $('#searchClear').hidden = !event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ui.query = event.target.value;
      const notes = filteredNotes();
      if (!notes.some((note) => note.id === ui.selectedNoteId)) {
        ui.selectedNoteId = notes.length ? notes[0].id : null;
        renderDetail();
      }
      renderNotes();
    }, 180);
  });

  $('#searchClear').addEventListener('click', () => {
    $('#searchInput').value = '';
    $('#searchClear').hidden = true;
    ui.query = '';
    clearTimeout(searchTimer);
    const notes = filteredNotes();
    ui.selectedNoteId = notes.length ? notes[0].id : null;
    renderNotes();
    renderDetail();
  });

  $('#noteList').addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      event.stopPropagation();
      openEditor(Number(editButton.dataset.edit));
      return;
    }
    const card = event.target.closest('.note-card');
    if (card) selectNote(Number(card.dataset.id));
  });

  $('#noteList').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.note-card');
    if (card) {
      event.preventDefault();
      selectNote(Number(card.dataset.id));
    }
  });

  $('#addProjectBtn').addEventListener('click', () => {
    $('#projectInputWrap').hidden = false;
    $('#projectInput').value = '';
    $('#projectInput').focus();
  });

  $('#projectInput').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $('#projectInputWrap').hidden = true;
      return;
    }
    if (event.key !== 'Enter') return;
    const name = event.target.value.trim();
    if (!name) return;
    if (state.projects.some((project) => fold(project.name) === fold(name))) {
      toast('Dự án này đã tồn tại.', true);
      return;
    }
    const id = state.projects.reduce((max, project) => Math.max(max, Number(project.id) || 0), 0) + 1;
    state.projects.push({ id, name, description: '', color: PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length], created_at: nowString() });
    saveState();
    $('#projectInputWrap').hidden = true;
    ui.selectedProjectId = id;
    ui.selectedNoteId = null;
    renderProjects();
    renderNotes();
    renderDetail();
    toast(`Đã tạo dự án “${name}”.`);
  });

  $('#noteForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#fieldTitle').value.trim();
    const content = $('#fieldContent').value.trim();
    if (!title || !content) {
      toast('Vui lòng nhập tiêu đề và nội dung.', true);
      return;
    }

    const projectValue = $('#fieldProject').value;
    const projectId = projectValue ? Number(projectValue) : null;
    const project = state.projects.find((item) => String(item.id) === String(projectValue));
    const images = ui.draftImages.map((image) => ({
      filename: image.filename || 'image.jpg',
      url: image.src || image.url || ''
    }));
    const timestamp = nowString();

    if (ui.editingId != null) {
      const note = state.notes.find((item) => item.id === ui.editingId);
      if (note) {
        Object.assign(note, {
          title, raw_content: content,
          tags: $('#fieldTags').value.trim(),
          project_id: projectId,
          project_name: project ? project.name : 'Chung',
          images, updated_at: timestamp
        });
        ui.selectedNoteId = note.id;
      }
    } else {
      const note = {
        id: nextNoteId(),
        project_id: projectId,
        project_name: project ? project.name : 'Chung',
        title,
        raw_content: content,
        tags: $('#fieldTags').value.trim(),
        images,
        created_at: timestamp,
        updated_at: timestamp
      };
      state.notes.push(note);
      ui.selectedNoteId = note.id;
    }

    saveState();
    closeEditor();
    renderAll();
    toast('Đã lưu ghi chú.');
  });

  $('#editorClose').addEventListener('click', closeEditor);
  $('#editorCancel').addEventListener('click', closeEditor);
  $('#editorOverlay').addEventListener('click', (event) => {
    if (event.target === $('#editorOverlay')) closeEditor();
  });

  $('#imagePickBtn').addEventListener('click', () => $('#imageInput').click());
  $('#imageInput').addEventListener('change', (event) => {
    handleFiles(event.target.files);
    event.target.value = '';
  });
  $('#imagePreview').addEventListener('click', (event) => {
    const remove = event.target.closest('.preview-remove');
    if (!remove) return;
    ui.draftImages.splice(Number(remove.dataset.index), 1);
    renderImagePreview();
  });
  $('#imageDrop').addEventListener('dragover', (event) => {
    event.preventDefault();
    $('#imageDrop').classList.add('dragover');
  });
  $('#imageDrop').addEventListener('dragleave', () => $('#imageDrop').classList.remove('dragover'));
  $('#imageDrop').addEventListener('drop', (event) => {
    event.preventDefault();
    $('#imageDrop').classList.remove('dragover');
    handleFiles(event.dataTransfer.files);
  });

  $('#confirmCancel').addEventListener('click', () => {
    $('#confirmOverlay').hidden = true;
    ui.confirmAction = null;
  });
  $('#confirmOk').addEventListener('click', () => {
    const action = ui.confirmAction;
    $('#confirmOverlay').hidden = true;
    ui.confirmAction = null;
    if (action) action();
  });
  $('#confirmOverlay').addEventListener('click', (event) => {
    if (event.target === $('#confirmOverlay')) $('#confirmCancel').click();
  });

  $('#lightboxClose').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', (event) => {
    if (event.target === $('#lightbox') || event.target.tagName === 'IMG') closeLightbox();
  });

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.notes) || !Array.isArray(data.projects)) throw new Error('Sai định dạng');
      askConfirm('Nhập dữ liệu?', 'Dữ liệu hiện tại sẽ được thay thế bằng file bạn chọn.', 'Nhập', () => {
        state = data;
        ui.selectedProjectId = null;
        ui.selectedNoteId = state.notes.length ? state.notes[0].id : null;
        saveState();
        renderAll();
        toast('Đã nhập dữ liệu thành công.');
      });
    } catch (error) {
      toast('File không hợp lệ. Vui lòng chọn file xuất từ ứng dụng.', true);
    }
  });

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebarScrim').hidden = false;
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebarScrim').hidden = true;
  }

  $('#menuBtn').addEventListener('click', openSidebar);
  $('#sidebarClose').addEventListener('click', closeSidebar);
  $('#sidebarScrim').addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!$('#lightbox').hidden) closeLightbox();
      else if (!$('#editorOverlay').hidden) closeEditor();
      else if (!$('#confirmOverlay').hidden) $('#confirmCancel').click();
      else closeSidebar();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openEditor();
    }
  });

  // ---------- Init ----------
  const initial = filteredNotes();
  if (initial.length) ui.selectedNoteId = initial[0].id;
  renderAll();
})();
