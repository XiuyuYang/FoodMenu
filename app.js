(function () {
  'use strict';

  var STORAGE_KEY = 'foodmenu_data';
  var CATEGORIES = ['荤菜', '素菜', '汤', '主食', '小吃'];
  var GEMINI_MODEL = 'gemini-2.0-flash';
  var MAX_IMAGE_WIDTH = 800;
  var JPEG_QUALITY = 0.75;

  var state = {
    dishes: [],
    settings: { geminiApiKey: '' },
    filterCategory: '全部',
    searchQuery: '',
    editingId: null,
    viewingId: null,
    pendingImage: null,
    imageRemoved: false
  };

  var dishList = document.getElementById('dishList');
  var emptyState = document.getElementById('emptyState');
  var categoryFilters = document.getElementById('categoryFilters');
  var searchInput = document.getElementById('searchInput');
  var dishModal = document.getElementById('dishModal');
  var dishForm = document.getElementById('dishForm');
  var dishModalTitle = document.getElementById('dishModalTitle');
  var dishName = document.getElementById('dishName');
  var dishCategory = document.getElementById('dishCategory');
  var cameraInput = document.getElementById('cameraInput');
  var uploadInput = document.getElementById('uploadInput');
  var photoPreview = document.getElementById('photoPreview');
  var photoPlaceholder = document.getElementById('photoPlaceholder');
  var photoImg = document.getElementById('photoImg');
  var btnAnalyze = document.getElementById('btnAnalyze');
  var analyzeStatus = document.getElementById('analyzeStatus');
  var randomModal = document.getElementById('randomModal');
  var randomName = document.getElementById('randomName');
  var randomCategory = document.getElementById('randomCategory');
  var randomPhoto = document.getElementById('randomPhoto');
  var randomImg = document.getElementById('randomImg');
  var detailModal = document.getElementById('detailModal');
  var detailName = document.getElementById('detailName');
  var detailCategory = document.getElementById('detailCategory');
  var detailMeta = document.getElementById('detailMeta');
  var detailPhoto = document.getElementById('detailPhoto');
  var detailImg = document.getElementById('detailImg');
  var settingsModal = document.getElementById('settingsModal');
  var apiKeyInput = document.getElementById('apiKeyInput');
  var importInput = document.getElementById('importInput');

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        dishes: state.dishes,
        settings: state.settings
      }));
    } catch (e) {
      alert('保存失败，存储空间可能已满。请删除部分菜品图片或导出备份后清理。');
      throw e;
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getDishById(id) {
    return state.dishes.find(function (d) { return d.id === id; });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

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
      emptyState.textContent = state.dishes.length > 0
        ? '没有匹配的菜品'
        : '还没有菜品，点「添加菜品」录入第一道菜吧';
      return;
    }

    emptyState.hidden = true;
    dishList.innerHTML = filtered.map(function (d) {
      var thumb = d.image
        ? '<img class="dish-card__thumb" src="' + d.image + '" alt="">'
        : '<span class="dish-card__thumb dish-card__thumb--empty">🍽</span>';
      return (
        '<article class="dish-card" data-id="' + d.id + '">' +
          thumb +
          '<button type="button" class="dish-card__body btn-view" data-id="' + d.id + '">' +
            '<span class="dish-card__name">' + escapeHtml(d.name) + '</span>' +
            '<span class="tag">' + escapeHtml(d.category) + '</span>' +
          '</button>' +
          '<div class="dish-card__actions">' +
            '<button type="button" class="icon-btn btn-edit" title="编辑" data-id="' + d.id + '">✏️</button>' +
            '<button type="button" class="icon-btn btn-delete" title="删除" data-id="' + d.id + '">🗑</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    dishList.querySelectorAll('.btn-view').forEach(function (btn) {
      btn.addEventListener('click', function () { openDetailModal(btn.dataset.id); });
    });
    dishList.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });
    dishList.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteDish(btn.dataset.id);
      });
    });
  }

  function populateCategorySelect() {
    dishCategory.innerHTML = CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
  }

  function resetFormState() {
    state.pendingImage = null;
    state.imageRemoved = false;
    hideAnalyzeStatus();
    btnAnalyze.hidden = true;
  }

  function showPhotoPreview(dataUrl) {
    photoImg.src = dataUrl;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
    btnAnalyze.hidden = false;
  }

  function resetPhotoUI() {
    photoPreview.hidden = true;
    photoPlaceholder.hidden = false;
    photoImg.src = '';
    cameraInput.value = '';
    uploadInput.value = '';
    btnAnalyze.hidden = true;
  }

  function setPhotoFromDish(dish) {
    if (dish && dish.image) {
      showPhotoPreview(dish.image);
      state.pendingImage = dish.image;
    } else {
      resetPhotoUI();
    }
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

  function compressImage(file, callback) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w > MAX_IMAGE_WIDTH) {
          h = Math.round(h * MAX_IMAGE_WIDTH / w);
          w = MAX_IMAGE_WIDTH;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        callback(dataUrl);
      };
      img.onerror = function () { callback(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { callback(null); };
    reader.readAsDataURL(file);
  }

  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    compressImage(file, function (dataUrl) {
      if (!dataUrl) {
        alert('图片处理失败，请换一张试试');
        return;
      }
      state.pendingImage = dataUrl;
      state.imageRemoved = false;
      showPhotoPreview(dataUrl);
      hideAnalyzeStatus();
    });
  }

  function openAddModal() {
    state.editingId = null;
    dishModalTitle.textContent = '添加菜品';
    dishName.value = '';
    dishCategory.value = CATEGORIES[0];
    resetFormState();
    resetPhotoUI();
    dishModal.showModal();
  }

  function openEditModal(id) {
    var dish = getDishById(id);
    if (!dish) return;
    if (detailModal.open) detailModal.close();
    state.editingId = id;
    dishModalTitle.textContent = '编辑菜品';
    dishName.value = dish.name;
    dishCategory.value = dish.category;
    resetFormState();
    setPhotoFromDish(dish);
    dishModal.showModal();
  }

  function openDetailModal(id) {
    var dish = getDishById(id);
    if (!dish) return;
    state.viewingId = id;
    detailName.textContent = dish.name;
    detailCategory.textContent = dish.category;
    var meta = [];
    if (dish.createdAt) meta.push('添加于 ' + formatDate(dish.createdAt));
    if (dish.updatedAt && dish.updatedAt !== dish.createdAt) {
      meta.push('更新于 ' + formatDate(dish.updatedAt));
    }
    detailMeta.textContent = meta.join(' · ');
    if (dish.image) {
      detailImg.src = dish.image;
      detailPhoto.hidden = false;
    } else {
      detailPhoto.hidden = true;
      detailImg.src = '';
    }
    detailModal.showModal();
  }

  function resolveDishImage(existing) {
    if (state.imageRemoved) return null;
    if (state.pendingImage) return state.pendingImage;
    return existing && existing.image ? existing.image : null;
  }

  function saveDish(e) {
    e.preventDefault();
    var name = dishName.value.trim();
    if (!name) return;

    var now = new Date().toISOString();
    var existing = state.editingId ? getDishById(state.editingId) : null;
    var dish = {
      id: state.editingId || generateId(),
      name: name,
      category: dishCategory.value,
      image: resolveDishImage(existing),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    if (state.editingId) {
      state.dishes = state.dishes.map(function (d) {
        return d.id === state.editingId ? dish : d;
      });
    } else {
      var dup = state.dishes.some(function (d) {
        return d.name === dish.name && d.category === dish.category;
      });
      if (dup && !confirm('已有同名同分类的菜品，仍要添加吗？')) return;
      state.dishes.push(dish);
    }

    saveData();
    dishModal.close();
    renderDishList();
  }

  function deleteDish(id) {
    var dish = getDishById(id);
    if (!dish) return;
    if (!confirm('确定删除「' + dish.name + '」吗？')) return;
    state.dishes = state.dishes.filter(function (d) { return d.id !== id; });
    saveData();
    if (detailModal.open && state.viewingId === id) detailModal.close();
    renderDishList();
  }

  function pickRandom() {
    var filtered = getFilteredDishes();
    if (filtered.length === 0) {
      alert(state.dishes.length === 0 ? '还没有菜品，先添加一些吧！' : '当前筛选下没有菜品');
      return;
    }
    var pick = filtered[Math.floor(Math.random() * filtered.length)];
    randomName.textContent = pick.name;
    randomCategory.textContent = pick.category;
    if (pick.image) {
      randomImg.src = pick.image;
      randomPhoto.hidden = false;
    } else {
      randomPhoto.hidden = true;
    }
    randomModal.showModal();
  }

  function analyzePhoto() {
    var apiKey = state.settings.geminiApiKey;
    if (!apiKey) {
      setAnalyzeStatus('error', '请先在设置中填写 Gemini API Key');
      return;
    }
    if (!state.pendingImage) {
      setAnalyzeStatus('error', '请先拍照或上传图片');
      return;
    }

    var base64 = state.pendingImage.split(',')[1];
    var mime = 'image/jpeg';

    setAnalyzeStatus('loading', '正在识图分析…');
    btnAnalyze.disabled = true;
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
            { inline_data: { mime_type: mime, data: base64 } }
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
        setAnalyzeStatus('success', '识图完成，请确认后保存');
      })
      .catch(function (err) {
        setAnalyzeStatus('error', '识图失败：' + err.message + '（可手动填写）');
      })
      .finally(function () {
        btnAnalyze.disabled = false;
        dishName.disabled = false;
        dishCategory.disabled = false;
      });
  }

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
            image: d.image || null,
            createdAt: d.createdAt || new Date().toISOString(),
            updatedAt: d.updatedAt || d.createdAt || new Date().toISOString()
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

  function openChangePhotoMenu() {
    if (confirm('选择图片来源：\n确定 = 从相册上传\n取消 = 重新拍照')) {
      uploadInput.click();
    } else {
      cameraInput.click();
    }
  }

  document.getElementById('btnAdd').addEventListener('click', openAddModal);
  document.getElementById('btnRandom').addEventListener('click', pickRandom);
  document.getElementById('btnRandomAgain').addEventListener('click', pickRandom);
  document.getElementById('btnRandomClose').addEventListener('click', function () { randomModal.close(); });
  document.getElementById('btnCancelDish').addEventListener('click', function () { dishModal.close(); });
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);
  document.getElementById('btnExport').addEventListener('click', exportBackup);
  document.getElementById('btnImport').addEventListener('click', function () { importInput.click(); });
  document.getElementById('btnCamera').addEventListener('click', function () { cameraInput.click(); });
  document.getElementById('btnUpload').addEventListener('click', function () { uploadInput.click(); });
  document.getElementById('btnAnalyze').addEventListener('click', analyzePhoto);
  document.getElementById('btnChangePhoto').addEventListener('click', openChangePhotoMenu);
  document.getElementById('btnRemovePhoto').addEventListener('click', function () {
    state.pendingImage = null;
    state.imageRemoved = true;
    resetPhotoUI();
    hideAnalyzeStatus();
  });
  document.getElementById('btnDetailClose').addEventListener('click', function () { detailModal.close(); });
  document.getElementById('btnDetailEdit').addEventListener('click', function () {
    if (state.viewingId) openEditModal(state.viewingId);
  });
  document.getElementById('btnDetailDelete').addEventListener('click', function () {
    if (state.viewingId) deleteDish(state.viewingId);
  });

  dishForm.addEventListener('submit', saveDish);

  searchInput.addEventListener('input', function () {
    state.searchQuery = searchInput.value;
    renderDishList();
  });

  cameraInput.addEventListener('change', function () {
    if (cameraInput.files[0]) handleImageFile(cameraInput.files[0]);
  });
  uploadInput.addEventListener('change', function () {
    if (uploadInput.files[0]) handleImageFile(uploadInput.files[0]);
  });

  importInput.addEventListener('change', function () {
    if (importInput.files[0]) importBackup(importInput.files[0]);
    importInput.value = '';
  });

  loadData();
  populateCategorySelect();
  renderCategoryFilters();
  renderDishList();
})();
