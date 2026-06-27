(function () {
  'use strict';

  var STORAGE_KEY = 'foodmenu_data';
  var CATEGORIES = ['荤菜', '素菜', '汤', '主食', '小吃'];
  var MAX_IMAGE_WIDTH = 800;
  var JPEG_QUALITY = 0.75;

  var state = {
    dishes: [],
    settings: {},
    filterCategory: '全部',
    searchQuery: '',
    editingId: null,
    viewingId: null,
    pendingImage: null,
    imageRemoved: false,
    user: null,
    authMode: 'login'
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
  var importInput = document.getElementById('importInput');
  var authModal = document.getElementById('authModal');
  var authForm = document.getElementById('authForm');
  var authTitle = document.getElementById('authTitle');
  var authEmail = document.getElementById('authEmail');
  var authPassword = document.getElementById('authPassword');
  var authStatus = document.getElementById('authStatus');
  var btnAuthSubmit = document.getElementById('btnAuthSubmit');
  var headerUser = document.getElementById('headerUser');
  var headerEmail = document.getElementById('headerEmail');

  function getBasePath() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src');
      if (src && src.indexOf('app.js') !== -1) {
        if (src.charAt(0) === '/') {
          return src.replace(/\/app\.js(\?.*)?$/, '') || '';
        }
        var path = window.location.pathname;
        if (path.charAt(path.length - 1) === '/') {
          return path.slice(0, -1);
        }
        return path.replace(/\/[^/]*$/, '') || '';
      }
    }
    return '';
  }

  var BASE_PATH = getBasePath();

  function apiFetch(path, options) {
    options = options || {};
    var headers = options.headers || {};
    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    options.credentials = 'include';
    options.headers = headers;
    return fetch(BASE_PATH + '/api/' + path, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || '请求失败');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function loadLocalData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        return { dishes: data.dishes || [], settings: {} };
      }
    } catch (e) {
      console.error('load local failed', e);
    }
    return { dishes: [], settings: {} };
  }

  function clearLocalData() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function loadData() {
    /* 兼容旧调用，实际数据从云端加载 */
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

    var existing = state.editingId ? getDishById(state.editingId) : null;
    var payload = {
      name: name,
      category: dishCategory.value,
      image: resolveDishImage(existing),
      imageRemoved: state.imageRemoved
    };

    if (!state.editingId) {
      var dup = state.dishes.some(function (d) {
        return d.name === payload.name && d.category === payload.category;
      });
      if (dup && !confirm('已有同名同分类的菜品，仍要添加吗？')) return;
    }

    var btn = document.getElementById('btnSaveDish');
    btn.disabled = true;
    btn.textContent = '保存中…';

    var req;
    if (state.editingId) {
      req = apiFetch('dishes/' + state.editingId, { method: 'PUT', body: payload });
    } else {
      payload.id = generateId();
      req = apiFetch('dishes', { method: 'POST', body: payload });
    }

    req.then(function (data) {
      var dish = data.dish;
      if (state.editingId) {
        state.dishes = state.dishes.map(function (d) {
          return d.id === state.editingId ? dish : d;
        });
      } else {
        state.dishes.push(dish);
      }
      dishModal.close();
      renderDishList();
    }).catch(function (err) {
      alert('保存失败：' + err.message);
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = '保存';
    });
  }

  function deleteDish(id) {
    var dish = getDishById(id);
    if (!dish) return;
    if (!confirm('确定删除「' + dish.name + '」吗？')) return;

    apiFetch('dishes/' + id, { method: 'DELETE' }).then(function () {
      state.dishes = state.dishes.filter(function (d) { return d.id !== id; });
      if (detailModal.open && state.viewingId === id) detailModal.close();
      renderDishList();
    }).catch(function (err) {
      alert('删除失败：' + err.message);
    });
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
    if (!state.pendingImage) {
      setAnalyzeStatus('error', '请先拍照或上传图片');
      return;
    }

    setAnalyzeStatus('loading', '正在识图分析…');
    btnAnalyze.disabled = true;
    dishName.disabled = true;
    dishCategory.disabled = true;

    apiFetch('analyze', { method: 'POST', body: { image: state.pendingImage } })
      .then(function (result) {
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
    settingsModal.showModal();
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
        if (!confirm('导入将合并 ' + data.dishes.length + ' 道菜到云端（跳过已存在的），确定吗？')) return;
        apiFetch('sync', { method: 'POST', body: { dishes: data.dishes } }).then(function (result) {
          return loadDishesFromServer().then(function () {
            alert('导入成功！新增 ' + result.imported + ' 道菜');
          });
        }).catch(function (err) {
          alert('导入失败：' + err.message);
        });
      } catch (e) {
        alert('导入失败：' + e.message);
      }
    };
    reader.readAsText(file);
  }

  function setAuthStatus(type, msg) {
    authStatus.hidden = false;
    authStatus.className = 'auth-status auth-status--' + type;
    authStatus.textContent = msg;
  }

  function hideAuthStatus() {
    authStatus.hidden = true;
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    var isLogin = mode === 'login';
    authTitle.textContent = isLogin ? '登录账号' : '注册账号';
    btnAuthSubmit.textContent = isLogin ? '登录' : '注册';
    authPassword.autocomplete = isLogin ? 'current-password' : 'new-password';
    document.getElementById('authTabLogin').classList.toggle('auth-tab--active', isLogin);
    document.getElementById('authTabRegister').classList.toggle('auth-tab--active', !isLogin);
    hideAuthStatus();
  }

  function showAuthModal() {
    setAuthMode('login');
    authEmail.value = '';
    authPassword.value = '';
    authModal.showModal();
  }

  function updateHeaderUser() {
    if (state.user) {
      headerUser.hidden = false;
      headerEmail.textContent = state.user.email;
    } else {
      headerUser.hidden = true;
    }
  }

  function loadDishesFromServer() {
    return apiFetch('dishes').then(function (data) {
      state.dishes = data.dishes || [];
      renderDishList();
      return state.dishes;
    });
  }

  function offerLocalMigration(localDishes) {
    if (!localDishes || localDishes.length === 0) return Promise.resolve();
    if (state.dishes.length > 0) return Promise.resolve();
    return new Promise(function (resolve) {
      if (!confirm('检测到本机有 ' + localDishes.length + ' 道菜未同步，是否上传到云端？')) {
        resolve();
        return;
      }
      apiFetch('sync', { method: 'POST', body: { dishes: localDishes } })
        .then(function (result) {
          clearLocalData();
          return loadDishesFromServer().then(function () {
            alert('已同步 ' + result.imported + ' 道菜到云端');
            resolve();
          });
        })
        .catch(function (err) {
          alert('同步失败：' + err.message);
          resolve();
        });
    });
  }

  function onAuthSuccess(data) {
    state.user = data.user;
    authModal.close();
    updateHeaderUser();
    var local = loadLocalData();
    return loadDishesFromServer()
      .then(function () { return offerLocalMigration(local.dishes); });
  }

  function handleAuthSubmit(e) {
    e.preventDefault();
    hideAuthStatus();
    var email = authEmail.value.trim();
    var password = authPassword.value;
    if (!email || !password) return;

    setAuthStatus('loading', state.authMode === 'login' ? '登录中…' : '注册中…');
    btnAuthSubmit.disabled = true;

    var path = state.authMode === 'login' ? 'auth/login' : 'auth/register';
    apiFetch(path, { method: 'POST', body: { email: email, password: password } })
      .then(onAuthSuccess)
      .catch(function (err) {
        setAuthStatus('error', err.message);
      })
      .finally(function () {
        btnAuthSubmit.disabled = false;
      });
  }

  function handleLogout() {
    apiFetch('auth/logout', { method: 'POST' }).finally(function () {
      state.user = null;
      state.dishes = [];
      updateHeaderUser();
      renderDishList();
      showAuthModal();
    });
  }

  function initApp() {
    populateCategorySelect();
    renderCategoryFilters();
    apiFetch('auth/me').then(function (data) {
      state.user = data.user;
      updateHeaderUser();
      return loadDishesFromServer().then(function () {
          var local = loadLocalData();
          return offerLocalMigration(local.dishes);
        });
    }).catch(function () {
      showAuthModal();
    });
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
  document.getElementById('btnCloseSettings').addEventListener('click', function () { settingsModal.close(); });
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

  authForm.addEventListener('submit', handleAuthSubmit);
  authModal.addEventListener('cancel', function (e) {
    if (!state.user) e.preventDefault();
  });
  document.getElementById('authTabLogin').addEventListener('click', function () { setAuthMode('login'); });
  document.getElementById('authTabRegister').addEventListener('click', function () { setAuthMode('register'); });
  document.getElementById('btnLogout').addEventListener('click', handleLogout);

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

  initApp();
})();
