// Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbxvFBa84he83UdqRdQ7B8IINpiYfJ0XbSMqa6Bp8Jv70ScJMlDesLRqUInyky68WQ18Bw/exec'; // Replace with your deployed GS URL
const IMGBB_API_KEY = '8e145428c7eb6b32baa904bcc63ee944';
let cachedIDs = JSON.parse(localStorage.getItem('imageIDs')) || [];

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

function initializeApp() {
  setupNavigation();
  setupEventListeners();
  loadInitialData();
}

// Navigation Setup
function setupNavigation() {
    const selector = document.getElementById('section-selector');
    if (!selector) {  // Added null check
      console.error('Section selector not found');
      return;
    }
  
    selector.addEventListener('change', function(e) {  // Line 59 - Now properly structured
      const activeSection = document.querySelector('.section.active-section');
      const newSection = document.getElementById(e.target.value);
      
      if (activeSection) activeSection.classList.remove('active-section');
      if (newSection) newSection.classList.add('active-section');
      
      if (e.target.value !== 'retrieve-section') {
        resetRetrieveSection();
      }
    });
  }

// Event Listeners
function setupEventListeners() {
  // Upload Section
  document.getElementById('upload-btn').addEventListener('click', handleUpload);
  
  // Retrieve Section
  const retrieveInput = document.getElementById('retrieve-id');
  retrieveInput.addEventListener('input', handleRetrieveInput);
  retrieveInput.addEventListener('focus', handleRetrieveInput);
  retrieveInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      handleRetrieve();
    }
  });
  document.getElementById('retrieve-btn').addEventListener('click', handleRetrieve);
  
  // Delete Section
  document.getElementById('delete-btn').addEventListener('click', handleDelete);
  
  // Update Section
  document.getElementById('update-btn').addEventListener('click', handleUpdate);
  
  // WhatsApp Share
  document.getElementById('whatsapp-share').addEventListener('click', shareOnWhatsApp);
}

// API Communication
async function callBackend(endpoint, data) {
  try {
    const url = `${API_URL}?endpoint=${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    showError('Server communication failed');
    return null;
  }
}

// Data Loading
async function loadInitialData() {
  if (cachedIDs.length > 0) {
    populateDropdowns(cachedIDs);
  } else {
    await fetchIDs();
  }
}

async function fetchIDs() {
  const result = await callBackend('getIDs');
  if (result && result.success) {
    cachedIDs = result.data;
    localStorage.setItem('imageIDs', JSON.stringify(cachedIDs));
    populateDropdowns(cachedIDs);
  }
}

function populateDropdowns(ids) {
  const deleteDropdown = document.getElementById('delete-id');
  const updateDropdown = document.getElementById('update-id');
  
  // Clear existing options except first
  while (deleteDropdown.options.length > 1) deleteDropdown.remove(1);
  while (updateDropdown.options.length > 1) updateDropdown.remove(1);
  
  // Add new options
  ids.forEach(function(id) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    deleteDropdown.appendChild(option.cloneNode(true));
    updateDropdown.appendChild(option);
  });
}

// Section Handlers
async function handleUpload() {
  const idInput = document.getElementById('upload-id');
  const fileInput = document.getElementById('upload-file');
  
  // Validate
  if (!validateID(idInput.value)) {
    idInput.classList.add('is-invalid');
    return;
  }
  idInput.classList.remove('is-invalid');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    fileInput.classList.add('is-invalid');
    return;
  }
  fileInput.classList.remove('is-invalid');
  
  if (cachedIDs.includes(idInput.value)) {
    showError('ID already exists');
    return;
  }
  
  const file = fileInput.files[0];
  if (file.size > 32 * 1024 * 1024) {
    showError('Image must be <32MB');
    return;
  }
  
  showProgress('upload-progress', true);
  
  try {
    const imgbbUrl = await uploadToImgBB(file);
    const result = await callBackend('addImageRecord', {
      id: idInput.value,
      url: imgbbUrl
    });
    
    if (result && result.success) {
      cachedIDs.push(idInput.value);
      localStorage.setItem('imageIDs', JSON.stringify(cachedIDs));
      populateDropdowns(cachedIDs);
      idInput.value = '';
      fileInput.value = '';
      showSuccess('Upload successful!');
    }
  } catch (error) {
    showError('Upload failed');
  } finally {
    showProgress('upload-progress', false);
  }
}

async function handleRetrieve() {
  const id = document.getElementById('retrieve-id').value.trim();
  if (!id) {
    showError('Please enter ID');
    return;
  }
  
  const result = await callBackend('getImageURL', { id });
  if (result && result.success) {
    if (result.data) {
      displayImage(result.data);
    } else {
      showError('Image not found');
    }
  }
}

async function handleDelete() {
  const id = document.getElementById('delete-id').value;
  if (!id) {
    showError('Select ID to delete');
    return;
  }
  
  if (!confirm(`Delete ${id}?`)) return;
  
  const result = await callBackend('deleteImageRecord', { id });
  if (result && result.success) {
    cachedIDs = cachedIDs.filter(function(item) { return item !== id; });
    localStorage.setItem('imageIDs', JSON.stringify(cachedIDs));
    populateDropdowns(cachedIDs);
    document.getElementById('delete-id').value = '';
    showSuccess('Deleted successfully');
  }
}

async function handleUpdate() {
  const id = document.getElementById('update-id').value;
  const fileInput = document.getElementById('update-file');
  
  if (!id) {
    showError('Select ID to update');
    return;
  }
  
  if (!fileInput.files || fileInput.files.length === 0) {
    fileInput.classList.add('is-invalid');
    return;
  }
  fileInput.classList.remove('is-invalid');
  
  const file = fileInput.files[0];
  if (file.size > 32 * 1024 * 1024) {
    showError('Image must be <32MB');
    return;
  }
  
  showProgress('update-progress', true);
  
  try {
    const imgbbUrl = await uploadToImgBB(file);
    const result = await callBackend('updateImageRecord', {
      id: id,
      newUrl: imgbbUrl
    });
    
    if (result && result.success) {
      fileInput.value = '';
      showSuccess('Update successful!');
    }
  } catch (error) {
    showError('Update failed');
  } finally {
    showProgress('update-progress', false);
  }
}

// Helper Functions
function handleRetrieveInput(e) {
  const input = e.target;
  const container = document.getElementById('suggestions-container');
  
  if (!input.value) {
    container.style.display = 'none';
    return;
  }
  
  const suggestions = cachedIDs.filter(function(id) {
    return id.toLowerCase().includes(input.value.toLowerCase());
  });
  
  if (suggestions.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.innerHTML = '';
  suggestions.forEach(function(id) {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.textContent = id;
    div.addEventListener('click', function() {
      input.value = id;
      container.style.display = 'none';
    });
    container.appendChild(div);
  });
  
  container.style.display = 'block';
}

function resetRetrieveSection() {
  document.getElementById('retrieve-id').value = '';
  document.getElementById('image-viewer').style.display = 'none';
  document.getElementById('suggestions-container').style.display = 'none';
}

function displayImage(url) {
  const image = document.getElementById('retrieved-image');
  image.src = url;
  document.getElementById('image-viewer').style.display = 'block';
}

async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append('image', file);
  
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error.message || 'Upload failed');
  }
  return data.data.url;
}

function shareOnWhatsApp() {
  const image = document.getElementById('retrieved-image');
  if (!image || !image.src) {
    showError('No image to share');
    return;
  }
  
  const message = `Check this image: ${image.src}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}

function validateID(id) {
  return /^[a-zA-Z0-9-_]+$/.test(id);
}

function showProgress(containerId, show) {
  const container = document.getElementById(containerId);
  const progressBar = container.querySelector('.progress-bar');
  container.style.display = show ? 'block' : 'none';
  progressBar.style.width = show ? '0%' : '100%';
  
  if (show) {
    let progress = 0;
    const interval = setInterval(function() {
      progress += 5;
      if (progress >= 90) clearInterval(interval);
      progressBar.style.width = `${progress}%`;
    }, 200);
  }
}

function showSuccess(message) {
  showToast('success', message);
}

function showError(message) {
  showToast('danger', message);
}

function showToast(type, message) {
  const toast = document.createElement('div');
  toast.className = 'position-fixed bottom-0 end-0 p-3';
  toast.style.zIndex = '1100';
  
  toast.innerHTML = `
    <div class="toast show">
      <div class="toast-header bg-${type} text-white">
        <strong class="me-auto">${type === 'success' ? 'Success' : 'Error'}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">${message}</div>
    </div>
  `;
  
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.remove();
  }, type === 'success' ? 3000 : 5000);
}
