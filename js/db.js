const DB_NAME = 'ScouterObjectDB';
const DB_VERSION = 1;
const STORE_NAME = 'scans';
let db = null;
let cachedScansList = [];

function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            loadSavedScansFromDB();
            resolve(db);
        };
        request.onerror = (e) => {
            console.error("IndexedDB error:", e);
            reject(e);
        };
    });
}

function saveScanToDB(record) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        tx.oncomplete = () => {
            loadSavedScansFromDB();
            resolve();
        };
        tx.onerror = (e) => reject(e);
    });
}

function getAllScansFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e);
    });
}

function deleteScanFromDB(id) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => {
            loadSavedScansFromDB();
            resolve();
        };
        tx.onerror = (e) => reject(e);
    });
}

function clearAllScans() {
    if (!confirm('Delete all saved scans from local database?')) return;
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => loadSavedScansFromDB();
}

async function loadSavedScansFromDB() {
    try {
        cachedScansList = await getAllScansFromDB();
        document.getElementById('inventoryBadgeCount').textContent = cachedScansList.length;
        renderInventoryList(cachedScansList);
    } catch (e) {
        console.error("Failed to load inventory:", e);
    }
}

function renderInventoryList(list) {
    const container = document.getElementById('inventoryList');
    container.innerHTML = '';

    if (list.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-500 font-mono-tech text-xs">
                NO SAVED SCANS FOUND IN INDEXEDDB.
            </div>`;
        return;
    }

    list.sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-slate-900/90 border border-slate-700/60 p-2.5 rounded-xl flex gap-3 items-center hover:border-amber-400/60 transition-all cursor-pointer';
        card.onclick = () => {
            displayAppraisalResult(item);
            toggleInventoryDrawer();
        };

        const dateStr = new Date(item.timestamp).toLocaleDateString();

        card.innerHTML = `
            <img src="${item.thumbnail || 'https://placehold.co/100x100/0f172a/06b6d4?text=SCAN'}" class="w-14 h-14 object-cover rounded-lg border border-cyan-500/30 flex-shrink-0">
            <div class="flex-1 overflow-hidden">
                <div class="flex justify-between items-start">
                    <h4 class="font-orbitron font-bold text-xs text-white truncate">${item.objectName}</h4>
                    <span class="text-[9px] font-mono-tech text-amber-400 font-bold">${item.rarity}</span>
                </div>
                <p class="text-[10px] text-slate-400 truncate font-mono-tech">${item.category}</p>
                <span class="text-[9px] text-slate-500 font-mono-tech">${dateStr}</span>
            </div>
            <button onclick="event.stopPropagation(); deleteScanItem('${item.id}')" class="text-slate-500 hover:text-red-400 p-1.5 text-xs">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        container.appendChild(card);
    });
}

function filterInventory() {
    const query = document.getElementById('inventorySearch').value.toLowerCase();
    const filtered = cachedScansList.filter(item => 
        item.objectName.toLowerCase().includes(query) || 
        item.category.toLowerCase().includes(query) ||
        item.rarity.toLowerCase().includes(query)
    );
    renderInventoryList(filtered);
}

async function deleteScanItem(id) {
    await deleteScanFromDB(id);
}

function toggleInventoryDrawer() {
    const drawer = document.getElementById('inventoryDrawer');
    drawer.classList.toggle('translate-x-full');
}