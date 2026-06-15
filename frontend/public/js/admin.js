const Admin = {
    globalData: {
        orders: [],
        jobs: [],
        transactions: []
    },
    
    init() {
        if (!App.state.token) {
            window.location.href = 'index.html?login=true';
            return;
        }

        if (App.state.user.role !== 'admin') {
            alert('Access Denied. Admins only.');
            window.location.href = 'index.html';
            return;
        }

        this.bindTabs();
        this.loadProducts();
        
        // Pre-fetch global data for client-side filtering
        this.fetchAdmin('/api/admin/orders').then(res => this.globalData.orders = res.orders).catch(()=>{});
        this.fetchAdmin('/api/admin/delivery-jobs').then(res => this.globalData.jobs = res.jobs).catch(()=>{});
        this.fetchAdmin('/api/admin/wallet').then(res => this.globalData.transactions = res.transactions).catch(()=>{});
    },

    bindTabs() {
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.hasAttribute('onclick')) return;

                document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');

                if (tabId === 'status') this.loadSystemStatus();
                if (tabId === 'products') this.loadProducts();
                if (tabId === 'players') { document.getElementById('player-search-results').style.display='block'; document.getElementById('player-profile-view').style.display='none'; }
                if (tabId === 'orders') this.loadOrders();
                if (tabId === 'delivery') this.loadDelivery();
                if (tabId === 'wallet') this.loadWallet();
                if (tabId === 'topup') this.loadTopup();
            });
        });
    },

    async fetchAdmin(path, options) {
        try {
            const res = await App.api(path, options);
            if (!res.ok) throw new Error(res.error || 'Server error');
            return res;
        } catch (e) {
            alert('Error: ' + e.message);
            throw e;
        }
    },

    // --- SYSTEM STATUS & SETTINGS ---
    async loadSystemStatus() {
        try {
            const res = await this.fetchAdmin('/api/admin/system-status');
            
            document.getElementById('status-bridge-token').value = res.bridge_token;
            
            const bIcon = document.getElementById('status-bridge-icon');
            const bText = document.getElementById('status-bridge-text');
            if (res.bridge_connected) {
                bIcon.style.color = 'var(--success)';
                bText.innerText = 'Online';
            } else {
                bIcon.style.color = 'var(--danger)';
                bText.innerText = 'Offline (No Plugin Connected)';
            }
            
            const nIcon = document.getElementById('status-nlogin-icon');
            const nText = document.getElementById('status-nlogin-text');
            if (res.nlogin_db_status) {
                nIcon.style.color = 'var(--success)';
                nText.innerText = 'Connected';
            } else {
                nIcon.style.color = 'var(--danger)';
                nText.innerText = 'Connection Failed';
            }

            // Load Settings
            const setRes = await this.fetchAdmin('/api/admin/settings');
            const s = setRes.settings;
            document.getElementById('setting-server-ip').value = s.SERVER_IP || '';
            document.getElementById('setting-server-port').value = s.SERVER_PORT || '';
            document.getElementById('setting-nlogin-host').value = s.NLOGIN_DB_HOST || '';
            document.getElementById('setting-nlogin-port').value = s.NLOGIN_DB_PORT || '';
            document.getElementById('setting-nlogin-name').value = s.NLOGIN_DB_NAME || '';
            document.getElementById('setting-nlogin-user').value = s.NLOGIN_DB_USER || '';
            document.getElementById('setting-nlogin-password').value = s.NLOGIN_DB_PASSWORD || '';
            document.getElementById('setting-promptpay-target').value = s.PROMPTPAY_TARGET || '';
            document.getElementById('setting-promptpay-name').value = s.PROMPTPAY_NAME || '';
            document.getElementById('setting-point-rate').value = s.POINT_RATE || '1.0';
            
        } catch(e) {
            console.error('Failed to load system status', e);
        }
    },

    async regenerateToken() {
        if (!confirm('Are you sure? All connected Minecraft servers will be disconnected until they update their config.')) return;
        try {
            const res = await this.fetchAdmin('/api/admin/settings/regenerate-token', { method: 'POST' });
            document.getElementById('status-bridge-token').value = res.token;
            App.showToast('Token regenerated successfully');
            this.loadSystemStatus();
        } catch (e) {
            console.error(e);
        }
    },

    async saveSettings() {
        const payload = {
            SERVER_IP: document.getElementById('setting-server-ip').value,
            SERVER_PORT: document.getElementById('setting-server-port').value,
            NLOGIN_DB_HOST: document.getElementById('setting-nlogin-host').value,
            NLOGIN_DB_PORT: document.getElementById('setting-nlogin-port').value,
            NLOGIN_DB_NAME: document.getElementById('setting-nlogin-name').value,
            NLOGIN_DB_USER: document.getElementById('setting-nlogin-user').value,
            NLOGIN_DB_PASSWORD: document.getElementById('setting-nlogin-password').value,
            PROMPTPAY_TARGET: document.getElementById('setting-promptpay-target').value,
            PROMPTPAY_NAME: document.getElementById('setting-promptpay-name').value,
            POINT_RATE: document.getElementById('setting-point-rate').value,
        };

        try {
            await this.fetchAdmin('/api/admin/settings', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            App.showToast('Settings saved successfully!');
            this.loadSystemStatus();
        } catch (e) {
            console.error(e);
        }
    },

    // --- PLAYERS ---
    async searchPlayers() {
        const q = document.getElementById('player-search-input').value.trim();
        if (!q) return;
        const res = await this.fetchAdmin(`/api/admin/players/search?q=${encodeURIComponent(q)}`);
        const tbody = document.getElementById('player-search-tbody');
        tbody.innerHTML = '';
        if (res.players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No players found</td></tr>';
            return;
        }
        res.players.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.id}</td>
                <td>${App.escapeHTML(p.username)}</td>
                <td>${App.escapeHTML(p.email || '-')}</td>
                <td>${p.last_seen ? new Date(p.last_seen).toLocaleString() : '-'}</td>
                <td><button class="submit-login-btn btn-view-profile" style="padding:6px 12px; width:auto">View Profile</button></td>
            `;
            tr.querySelector('.btn-view-profile').onclick = () => Admin.viewPlayerProfile(p.username);
            tbody.appendChild(tr);
        });
    },

    async viewPlayerProfile(username) {
        // Hide search, show profile
        document.getElementById('player-search-results').style.display = 'none';
        document.getElementById('player-profile-view').style.display = 'block';
        
        // Fetch specific player profile
        const res = await this.fetchAdmin(`/api/admin/players/${encodeURIComponent(username)}`);
        const p = res.player;
        
        document.getElementById('profile-username').innerText = p.username;
        document.getElementById('profile-email').innerText = p.email || '-';
        document.getElementById('profile-created').innerText = p.created_at ? new Date(p.created_at).toLocaleString() : '-';
        document.getElementById('profile-lastseen').innerText = p.last_seen ? new Date(p.last_seen).toLocaleString() : '-';
        
        // Client-side Relation Filtering
        // 1. Wallet Balance
        const userTxs = this.globalData.transactions.filter(t => t.username === p.username);
        if (userTxs.length > 0) {
            document.getElementById('profile-balance').innerText = userTxs[0].balance_after;
        } else {
            document.getElementById('profile-balance').innerText = "0";
        }

        // 2. Orders
        const userOrders = this.globalData.orders.filter(o => o.username === p.username);
        const oTbody = document.getElementById('profile-orders-tbody');
        oTbody.innerHTML = '';
        if (userOrders.length === 0) {
            oTbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No recent orders found</td></tr>';
        }
        
        const orderIds = new Set();
        userOrders.forEach(o => {
            orderIds.add(o.id);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${o.id}</td><td>${o.total_points}</td><td>${o.status}</td><td>${new Date(o.created_at).toLocaleString()}</td>`;
            oTbody.appendChild(tr);
        });

        // 3. Delivery Jobs (matched by orderIds)
        const userJobs = this.globalData.jobs.filter(j => orderIds.has(j.order_id));
        const jTbody = document.getElementById('profile-jobs-tbody');
        jTbody.innerHTML = '';
        if (userJobs.length === 0) {
            jTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No recent delivery jobs found</td></tr>';
        }
        userJobs.forEach(j => {
            const tr = document.createElement('tr');
            let actions = j.status === 'failed' ? `<button class="action-btn btn-retry" onclick="Admin.retryJob(${j.id})">Retry</button>` : '';
            tr.innerHTML = `<td>${j.id}</td><td>${j.order_id}</td><td>${j.status}</td><td>${j.retry_count}</td><td>${actions}</td>`;
            jTbody.appendChild(tr);
        });
    },

    openPlayerWalletModal(action) {
        const username = document.getElementById('profile-username').innerText;
        document.getElementById('wallet-username').value = username;
        document.getElementById('wallet-action').value = action;
        document.getElementById('wallet-amount').value = '';
        document.getElementById('wallet-modal').classList.add('active');
    },

    // --- PRODUCTS ---
    async loadProducts() {
        const res = await this.fetchAdmin('/api/admin/products');
        const tbody = document.getElementById('products-tbody');
        tbody.innerHTML = '';
        res.products.forEach(p => {
            const tr = document.createElement('tr');
            const status = p.active ? '<span style="color:var(--success)">Active</span>' : '<span style="color:var(--danger)">Disabled</span>';
            tr.innerHTML = `
                <td>${p.id}</td>
                <td>${App.escapeHTML(p.sku)}</td>
                <td>${App.escapeHTML(p.name)}</td>
                <td>${p.price_points}</td>
                <td>${status}</td>
                <td>
                    <button class="action-btn btn-edit">Edit</button>
                </td>
            `;
            tr.querySelector('.btn-edit').onclick = () => Admin.editProduct(p);
            tbody.appendChild(tr);
        });
    },

    openProductModal() {
        document.getElementById('prod-id').value = '';
        document.getElementById('prod-sku').value = '';
        document.getElementById('prod-name').value = '';
        document.getElementById('prod-desc').value = '';
        document.getElementById('prod-price').value = '';
        document.getElementById('prod-cmd').value = '';
        document.getElementById('prod-active').value = '1';
        document.getElementById('product-modal-title').innerText = 'Create Product';
        document.getElementById('product-modal').classList.add('active');
    },

    editProduct(p) {
        document.getElementById('prod-id').value = p.id;
        document.getElementById('prod-sku').value = p.sku;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-desc').value = p.description;
        document.getElementById('prod-price').value = p.price_points;
        document.getElementById('prod-cmd').value = p.minecraft_command;
        document.getElementById('prod-active').value = p.active;
        document.getElementById('product-modal-title').innerText = 'Edit Product';
        document.getElementById('product-modal').classList.add('active');
    },

    async saveProduct(e) {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        const payload = {
            sku: document.getElementById('prod-sku').value,
            name: document.getElementById('prod-name').value,
            description: document.getElementById('prod-desc').value,
            pricePoints: parseInt(document.getElementById('prod-price').value),
            command: document.getElementById('prod-cmd').value,
            active: parseInt(document.getElementById('prod-active').value)
        };

        const path = id ? `/api/products/${id}` : '/api/products';
        const method = id ? 'PATCH' : 'POST';

        await this.fetchAdmin(path, { method, body: JSON.stringify(payload) });
        document.getElementById('product-modal').classList.remove('active');
        App.showToast('Product saved successfully');
        this.loadProducts();
    },

    // --- ORDERS ---
    async loadOrders() {
        const res = await this.fetchAdmin('/api/admin/orders');
        const tbody = document.getElementById('orders-tbody');
        tbody.innerHTML = '';
        res.orders.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${o.id}</td>
                <td>${App.escapeHTML(o.username)}</td>
                <td>${o.total_points}</td>
                <td>${App.escapeHTML(o.status)}</td>
                <td>${new Date(o.created_at).toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- DELIVERY JOBS ---
    async loadDelivery() {
        const res = await this.fetchAdmin('/api/admin/delivery-jobs');
        const tbody = document.getElementById('delivery-tbody');
        tbody.innerHTML = '';
        res.jobs.forEach(j => {
            const tr = document.createElement('tr');
            let actions = '';
            if (j.status === 'failed') {
                actions = `<button class="action-btn btn-retry">Retry</button>`;
            }
            tr.innerHTML = `
                <td>${j.id}</td>
                <td>${j.order_id}</td>
                <td>${App.escapeHTML(j.status)}</td>
                <td>${j.retry_count}</td>
                <td><small>${App.escapeHTML(j.last_error || '-')}</small></td>
                <td>${actions}</td>
            `;
            if (j.status === 'failed') {
                tr.querySelector('.btn-retry').onclick = () => Admin.retryJob(j.id);
            }
            tbody.appendChild(tr);
        });
    },

    async retryJob(id) {
        if (!confirm('Are you sure you want to retry this delivery job?')) return;
        await this.fetchAdmin(`/api/admin/delivery-jobs/${id}/retry`, { method: 'POST' });
        App.showToast('Job queued for retry');
        this.loadDelivery();
    },

    // --- WALLET ---
    async loadWallet() {
        const res = await this.fetchAdmin('/api/admin/wallet');
        const tbody = document.getElementById('wallet-tbody');
        tbody.innerHTML = '';
        res.transactions.forEach(t => {
            const tr = document.createElement('tr');
            const color = t.type === 'credit' ? 'var(--success)' : 'var(--danger)';
            tr.innerHTML = `
                <td>${t.id}</td>
                <td>${App.escapeHTML(t.username)}</td>
                <td style="color:${color}; font-weight:bold;">${App.escapeHTML(t.type).toUpperCase()}</td>
                <td>${t.amount_points}</td>
                <td>${t.balance_after}</td>
                <td>${App.escapeHTML(t.reference_type)}</td>
                <td>${new Date(t.created_at).toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    openWalletModal() {
        document.getElementById('wallet-username').value = '';
        document.getElementById('wallet-amount').value = '';
        document.getElementById('wallet-modal').classList.add('active');
    },

    async saveWallet(e) {
        e.preventDefault();
        const username = document.getElementById('wallet-username').value;
        const action = document.getElementById('wallet-action').value;
        const amount = parseInt(document.getElementById('wallet-amount').value);

        await this.fetchAdmin(`/api/admin/wallet/${action}`, {
            method: 'POST',
            body: JSON.stringify({ username, amount_points: amount })
        });
        
        document.getElementById('wallet-modal').classList.remove('active');
        App.showToast('Wallet updated successfully');
        
        // Refresh global data
        const tRes = await this.fetchAdmin('/api/admin/wallet');
        this.globalData.transactions = tRes.transactions;
        
        // If we are currently viewing the player profile for this user, refresh it
        if (document.getElementById('players').classList.contains('active') && document.getElementById('player-profile-view').style.display === 'block') {
            if (document.getElementById('profile-username').innerText === username) {
                this.viewPlayerProfile(username);
            }
        }
        
        this.loadWallet();
    },

    // --- TOPUP ---
    async loadTopup() {
        const res = await this.fetchAdmin('/api/admin/topup');
        const tbody = document.getElementById('topup-tbody');
        tbody.innerHTML = '';
        res.requests.forEach(t => {
            const tr = document.createElement('tr');
            let actions = '-';
            if (t.status === 'pending') {
                actions = `
                    <button class="action-btn btn-approve">Approve</button>
                    <button class="action-btn btn-reject">Reject</button>
                `;
            }
            
            let slipHtml = '-';
            if (t.provider_reference) {
                slipHtml = `<a href="${t.provider_reference}" target="_blank" class="action-btn" style="background:#6366f1; color:white;"><i class="fas fa-image"></i> View Slip</a>`;
            }
            
            tr.innerHTML = `
                <td>${t.id}</td>
                <td>${App.escapeHTML(t.username)}</td>
                <td>${(t.amount_minor / 100).toFixed(2)} บาท</td>
                <td>${t.points}</td>
                <td>${App.escapeHTML(t.status).toUpperCase()}</td>
                <td>${slipHtml}</td>
                <td>${new Date(t.created_at).toLocaleString()}</td>
                <td>${actions}</td>
            `;
            if (t.status === 'pending') {
                tr.querySelector('.btn-approve').onclick = () => Admin.actionTopup(t.id, 'approve');
                tr.querySelector('.btn-reject').onclick = () => Admin.actionTopup(t.id, 'reject');
            }
            tbody.appendChild(tr);
        });
    },

    async actionTopup(id, action) {
        if (!confirm(`Are you sure you want to ${action} this request?`)) return;
        await this.fetchAdmin(`/api/admin/topup/${id}/${action}`, { method: 'POST' });
        App.showToast(`Request ${action}d successfully`);
        this.loadTopup();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Wait for App to be initialized before Admin init
    setTimeout(() => Admin.init(), 100);
});
