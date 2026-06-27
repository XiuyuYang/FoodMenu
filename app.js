(function () {
  'use strict';

  var STORAGE_KEY = 'foodmenu_data';
  var CATEGORIES = ['荤菜', '素菜', '汤', '主食', '小吃'];
  var GEMINI_MODEL = 'gemini-2.0-flash';

  var state = {
    dishes: [],
    settings: { geminiApiKey: '' },
    filterCategory: '全部',
    searchQuery: '',
    editingId: null,
    photoBase64: null,
    photoMime: null
  };

  // ── DOM refs ──
  var dishList = document.getElementById('dishList');
  var emptyState = document.getElementById('emptyState');
  var categoryFilters = document.getElementById('categoryFilters');
  var searchInput = document.getElementById('searchInput');
  var dishModal = document.getElementById('dishModal');
  var dishForm = document.getElementById('dishForm');
  var dishModalTitle = document.getElementById('dishModalTitle');
  var dishName = document.getElementById('dishName');
  var dishCategory = document.getElementById('dishCategory');
  var photoInput = document.getElementById('photoInput');
  var photoPreview = document.getElementById('photoPreview');
  var photoImg = document.getElementById('photoImg');
  var photoPlaceholder = document.getElementById('btnTakePhoto');
  var analyzeStatus = document.getElementById('analyzeStatus');
  var randomModal = document.getElementById('randomModal');
  var randomName = document.getElementById('randomName');
  var randomCategory = document.getElementById('randomCategory');
  var settingsModal = document.getElementById('settingsModal');
  var apiKeyInput = document.getElementById('apiKeyInput');
  var importInput = document.getElementById('importInput');

  // ── Storage ──
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        state.dishes = data.dishes || [];
        state.settings = data.settings || { geminiApiKey: '' };
      }
    } catch (e) {
      console.error('load failed', e);
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      dishes: state.dishes,
      settings: state.settings
    }));
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Render ──
  function getFilteredDishes() {
    return state.dishes.filter(function (d) {
      var matchCat = state.filterCategory === '全部' || d.category === state.filterCategory;
      var q = state.searchQuery.trim().toLowerCase();
      var matchSearch = !q || d.name.toLowerCase().indexOf(q) !== -1;
      return matchCat && matchSearch;
    });
  }

  function renderCategoryFilters() {
    var cats = ['全部'].concat(CATEGORIES);
    categoryFilters.innerHTML = cats.map(function (cat) {
      var active = cat === state.filterCategory ? ' cat-btn--active' : '';
      return '<button type="button" class="cat-btn' + active + '" data-cat="' + cat + '">' + cat + '</button>';
    }).join('');

    categoryFilters.querySelectorAll('.cat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filterCategory = btn.dataset.cat;
        renderCategoryFilters();
        renderDishList();
      });
    });
  }

  function renderDishList() {
    var filtered = getFilteredDishes();
    filtered.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });

    if (filtered.length === 0) {
      dishList.innerHTML = '';
      emptyState.hidden = state.dishes.length > 0;
      if (state.dishes.length > 0) {
        emptyState.textContent = '没有匹配的菜品';
        emptyState.hidden = false;
      } else {
        emptyState.textContent = '还没有菜品，点「拍照录入」添加第一道菜吧';
      }
      return;
    }

    emptyState.hidden = true;
    dishList.innerHTML = filtered.map(function (d) {
      return (
        '<article class="dish-card" data-id="' + d.id + '">' +
          '<span class="dish-card__name">' + escapeHtml(d.name) + '</span>' +
          '<span class="tag">' + escapeHtml(d.category) + '</span>' +
          '<div class="dish-card__actions">' +
            '<button type="button" class="icon-btn btn-edit" title="编辑" data-id="' + d.id + '">✏️</button>' +
            '<button type="button" class="icon-btn btn-delete" title="删除" data-id="' + d.id + '">🗑</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    dishList.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditModal(btn.dataset.id); });
    });
    dishList.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteDish(btn.dataset.id); });
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function populateCategorySelect() {
    dishCategory.innerHTML = CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
  }

  // ── CRUD ──
  function openAddModal() {
    state.editingId = null;
    state.photoBase64 = null;
    state.photoMime = null;
    dishModalTitle.textContent = '拍照录入菜品';
    dishName.value = '';
    dishCategory.value = CATEGORIES[0];
    resetPhotoUI();
    hideAnalyzeStatus();
    dishModal.showModal();
  }

  function openEditModal(id) {
    var dish = state.dishes.find(function (d) { return d.id === id; });
    if (!dish) return;
    state.editingId = id;
    state.photoBase64 = null;
    state.photoMime = null;
    dishModalTitle.textContent = '编辑菜品';
    dishName.value = dish.name;
    dishCategory.value = dish.category;
    resetPhotoUI();
    hideAnalyzeStatus();
    dishModal.showModal();
  }

  function saveDish(e) {
    e.preventDefault();
    var name = dishName.value.trim();
    if (!name) return;

    var dish = {
      id: state.editingId || generateId(),
      name: name,
      category: dishCategory.value,
      createdAt: state.editingId
        ? (state.dishes.find(function (d) { return d.id === state.editingId; }) || {}).createdAt
        : new Date().toISOString()
    };

    if (state.editingId) {
      state.dishes = state.dishes.map(function (d) {
        return d.id === state.editingId ? dish : d;
      });
    } else {
      var dup = state.dishes.some(function (d) {
        return d.name === dish.name && d.category === dish.category;
      });
      if (dup) {
        if (!confirm('已有同名同分类的菜品，仍要添加吗？')) return;
      }
      state.dishes.push(dish);
    }

    saveData();
    dishModal.close();
    renderDishList();
  }

  function deleteDish(id) {
    var dish = state.dishes.find(function (d) { return d.id === id; });
    if (!dish) return;
    if (!confirm('确定删除「' + dish.name + '」吗？')) return;
    state.dishes = state.dishes.filter(function (d) { return d.id !== id; });
    saveData();
    renderDishList();
  }

  // ── Random ──
  function pickRandom() {
    var filtered = getFilteredDishes();
    if (filtered.length === 0) {
      alert(state.dishes.length === 0 ? '还没有菜品，先添加一些吧！' : '当前筛选下没有菜品');
      return;
    }
    var pick = filtered[Math.floor(Math.random() * filtered.length)];
    randomName.textContent = pick.name;
    randomCategory.textContent = pick.category;
    randomModal.showModal();
  }

  // ── Photo & Gemini ──
  function resetPhotoUI() {
    photoPreview.hidden = true;
    photoPlaceholder.hidden = false;
    photoInput.value = '';
  }

  function showPhotoPreview(dataUrl) {
    photoImg.src = dataUrl;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
  }

  function hideAnalyzeStatus() {
    analyzeStatus.hidden = true;
    analyzeStatus.className = 'analyze-status';
  }

  function setAnalyzeStatus(type, msg) {
    analyzeStatus.hidden = false;
    analyzeStatus.className = 'analyze-status analyze-status--' + type;
    analyzeStatus.textContent = msg;
  }

  function handlePhotoSelect(file) {
    if (!file || !file.type.startsWith('image/')) return;

    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      showPhotoPreview(dataUrl);
      var base64 = dataUrl.split(',')[1];
      state.photoBase64 = base64;
      state.photoMime = file.type;
      analyzePhoto();
    };
    reader.readAsDataURL(file);
  }

  function analyzePhoto() {
    var apiKey = state.settings.geminiApiKey;
    if (!apiKey) {
      setAnalyzeStatus('error', '请先在设置中填写 Gemini API Key');
      return;
    }
    if (!state.photoBase64) return;

    setAnalyzeStatus('loading', '正在识图分析…');
    dishName.disabled = true;
    dishCategory.disabled = true;

    var categoriesStr = CATEGORIES.join('、');
    var prompt =
      '这是一道菜的照片。请识别这道菜的中文名称，并从以下分类中选择最合适的一个：' +
      categoriesStr +
      '。只返回 JSON，格式为 {"name":"菜名","category":"分类"}，不要其他文字。' +
      '如果无法识别，name 填"未知菜品"，category 填"荤菜"。';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: state.photoMime || 'image/jpeg', data: state.photoBase64 } }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error((err.error && err.error.message) || 'API 请求失败');
          });
        }
        return res.json();
      })
      .then(function (data) {
        var text = data.candidates[0].content.parts[0].text;
        var result = JSON.parse(text);
        if (result.name) dishName.value = result.name;
        if (result.category && CATEGORIES.indexOf(result.category) !== -1) {
          dishCategory.value = result.category;
        }
        setAnalyzeStatus('success', '识图完成，请确认菜名和分类后保存');
      })
      .catch(function (err) {
        setAnalyzeStatus('error', '识图失败：' + err.message + '（可手动填写）');
      })
      .finally(function () {
        dishName.disabled = false;
        dishCategory.disabled = false;
        dishName.focus();
      });
  }

  // ── Settings ──
  function openSettings() {
    apiKeyInput.value = state.settings.geminiApiKey || '';
    settingsModal.showModal();
  }

  function saveSettings() {
    state.settings.geminiApiKey = apiKeyInput.value.trim();
    saveData();
    settingsModal.close();
  }

  function exportBackup() {
    var blob = new Blob([JSON.stringify({
      dishes: state.dishes,
      exportedAt: new Date().toISOString()
    }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我的菜单-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data.dishes || !Array.isArray(data.dishes)) throw new Error('格式不正确');
        if (!confirm('导入将覆盖现有 ' + state.dishes.length + ' 道菜，共导入 ' + data.dishes.length + ' 道，确定吗？')) return;
        state.dishes = data.dishes.map(function (d) {
          return {
            id: d.id || generateId(),
            name: d.name,
            category: CATEGORIES.indexOf(d.category) !== -1 ? d.category : '荤菜',
            createdAt: d.createdAt || new Date().toISOString()
          };
        });
        saveData();
        renderDishList();
        alert('导入成功！');
      } catch (e) {
        alert('导入失败：' + e.message);
      }
    };
    reader.readAsText(file);
  }

  // ── Event bindings ──
  document.getElementById('btnAdd').addEventListener('click', openAddModal);
  document.getElementById('btnRandom').addEventListener('click', pickRandom);
  document.getElementById('btnRandomAgain').addEventListener('click', pickRandom);
  document.getElementById('btnRandomClose').addEventListener('click', function () { randomModal.close(); });
  document.getElementById('btnCancelDish').addEventListener('click', function () { dishModal.close(); });
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);
  document.getElementById('btnExport').addEventListener('click', exportBackup);
  document.getElementById('btnImport').addEventListener('click', function () { importInput.click(); });

  dishForm.addEventListener('submit', saveDish);

  searchInput.addEventListener('input', function () {
    state.searchQuery = searchInput.value;
    renderDishList();
  });

  photoPlaceholder.addEventListener('click', function () { photoInput.click(); });
  document.getElementById('btnRetake').addEventListener('click', function () {
    resetPhotoUI();
    hideAnalyzeStatus();
    state.photoBase64 = null;
    photoInput.click();
  });
  photoInput.addEventListener('change', function () {
    if (photoInput.files[0]) handlePhotoSelect(photoInput.files[0]);
  });

  importInput.addEventListener('change', function () {
    if (importInput.files[0]) importBackup(importInput.files[0]);
    importInput.value = '';
  });

  // ── Init ──
  loadData();
  populateCategorySelect();
  renderCategoryFilters();
  renderDishList();
})();
