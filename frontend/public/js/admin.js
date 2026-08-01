const Admin = {
    globalData: {
        orders: [],
        jobs: [],
        transactions: [],
        topups: []
    },

    manualTopup: {
        pointRate: null,
        player: null,
        lookupRequest: 0,
        submitting: false
    },

    dashboardLoading: false,
    easySlipHealthLoading: false,
    
    init() {
        if (!App.state.token) {
            window.location.href = 'index.html?login=true';
            return;
        }

        if (App.state.user.role !== 'admin') {
            Swal.fire({ icon: 'error', title: 'ปฏิเสธการเข้าถึง', text: 'เข้าถึงได้เฉพาะแอดมินเท่านั้น', background: '#1a1f2b', color: '#fff' });
            window.location.href = 'index.html';
            return;
        }

        this.bindTabs();
        this.loadDashboard(false);
        
        // Pre-fetch global data for client-side filtering
        this.fetchAdmin('/api/admin/orders').then(res => this.globalData.orders = res.orders).catch(()=>{});
        this.fetchAdmin('/api/admin/delivery-jobs').then(res => this.globalData.jobs = res.jobs).catch(()=>{});
        this.fetchAdmin('/api/admin/wallet').then(res => this.globalData.transactions = res.transactions).catch(()=>{});
        this.fetchAdmin('/api/admin/topup').then(res => this.globalData.topups = res.requests).catch(()=>{});
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

                if (tabId === 'dashboard') this.loadDashboard(false);
                if (tabId === 'status') this.loadSystemStatus();
                if (tabId === 'products') this.loadProducts();
                if (tabId === 'players') { document.getElementById('player-search-results').style.display='block'; document.getElementById('player-profile-view').style.display='none'; this.loadPlayers(); }
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
            if (!res.ok) {
                const errMsg = App.translateError(res.error);
                const details = res.details ? `\nDetails: ${res.details}` : '';
                throw new Error(errMsg + details);
            }
            return res;
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'Error: ' + e.message, background: '#1a1f2b', color: '#fff' });
            throw e;
        }
    },

    setDashboardText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    },

    formatDashboardMoney(value) {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    },

    renderDashboard(data) {
        const integer = value => new Intl.NumberFormat('th-TH').format(Number(value) || 0);
        const topups = data?.topups || {};
        const orders = data?.orders || {};
        const delivery = data?.delivery || {};
        const minecraft = data?.minecraft || {};
        const health = data?.easySlip || {};

        this.setDashboardText('dashboard-revenue-today', this.formatDashboardMoney(topups.revenue?.today));
        this.setDashboardText('dashboard-revenue-month', this.formatDashboardMoney(topups.revenue?.month));
        this.setDashboardText('dashboard-topup-approved-caption', `${integer(topups.approved?.count)} รายการสำเร็จวันนี้`);
        this.setDashboardText('dashboard-orders-month', integer(orders.month));
        this.setDashboardText('dashboard-orders-caption', `วันนี้ ${integer(orders.today)} รายการ`);
        this.setDashboardText('dashboard-players-online', integer(minecraft.players?.online));
        this.setDashboardText('dashboard-players-max', integer(minecraft.players?.max));
        this.setDashboardText('dashboard-server-caption', minecraft.online
            ? `${minecraft.version || 'Minecraft'} • ${minecraft.host || ''}`
            : 'เซิร์ฟเวอร์ออฟไลน์ / ตรวจสอบไม่ได้');
        const playerCard = document.getElementById('dashboard-player-card');
        if (playerCard) playerCard.dataset.state = minecraft.online ? 'online' : 'offline';

        this.setDashboardText('dashboard-topup-approved', integer(topups.approved?.count));
        this.setDashboardText('dashboard-topup-pending', integer(topups.pending?.count));
        this.setDashboardText('dashboard-topup-pending-amount', this.formatDashboardMoney(topups.pending?.amount));
        this.setDashboardText('dashboard-topup-rejected', integer(topups.rejected?.count));

        const deliveryRate = Math.max(0, Math.min(100, Number(delivery.successRateToday) || 0));
        this.setDashboardText('dashboard-delivery-rate', `Success ${deliveryRate}%`);
        this.setDashboardText('dashboard-delivery-rate-number', `${deliveryRate}%`);
        this.setDashboardText('dashboard-delivery-success', integer(delivery.succeededToday));
        this.setDashboardText('dashboard-delivery-failed', integer(delivery.failedToday));
        this.setDashboardText('dashboard-delivery-queue', integer((Number(delivery.queued) || 0) + (Number(delivery.processing) || 0)));
        const donut = document.getElementById('dashboard-delivery-donut');
        if (donut) donut.style.setProperty('--delivery-rate', `${deliveryRate * 3.6}deg`);

        const sellers = document.getElementById('dashboard-best-sellers');
        if (sellers) {
            const rows = Array.isArray(orders.bestSellers) ? orders.bestSellers : [];
            sellers.innerHTML = rows.length ? rows.map((item, index) => `
                <div class="dashboard-seller">
                    <span class="dashboard-seller-rank">${index + 1}</span>
                    <div class="dashboard-seller-copy"><strong>${App.escapeHTML(item.name || 'สินค้า')}</strong><code>${App.escapeHTML(item.sku || '-')}</code></div>
                    <span class="dashboard-seller-sales"><strong>${integer(item.quantity)}</strong><small>ชิ้น</small></span>
                </div>`).join('') : '<div class="dashboard-empty-state"><i data-lucide="package-open"></i><span>เดือนนี้ยังไม่มีรายการขาย</span></div>';
        }

        const healthState = String(health.state || 'unavailable');
        const stateLabels = { healthy: 'พร้อมใช้งาน', degraded: 'ต้องตรวจสอบ', unavailable: 'เชื่อมต่อไม่ได้', blocked: 'ถูกระงับ', disabled: 'ยังไม่ตั้งค่า' };
        const remaining = Number(health.quota?.remaining);
        const maximum = Number(health.quota?.max);
        const used = Number(health.quota?.used);
        const quotaPercent = Number.isFinite(remaining) && Number.isFinite(maximum) && maximum > 0
            ? Math.max(0, Math.min(100, (remaining / maximum) * 100))
            : 0;
        const healthCard = document.getElementById('dashboard-easyslip-card');
        const healthPill = document.getElementById('dashboard-easyslip-state');
        if (healthCard) healthCard.dataset.state = healthState;
        if (healthPill) healthPill.className = `dashboard-health-pill ${healthState}`;
        this.setDashboardText('dashboard-easyslip-state', stateLabels[healthState] || 'ตรวจสอบไม่ได้');
        this.setDashboardText('dashboard-easyslip-remaining', Number.isFinite(remaining) ? integer(remaining) : '-');
        this.setDashboardText('dashboard-easyslip-used', Number.isFinite(used) ? `ใช้แล้ว ${integer(used)}` : 'ใช้แล้ว -');
        this.setDashboardText('dashboard-easyslip-max', Number.isFinite(maximum) ? `ทั้งหมด ${integer(maximum)}` : 'ทั้งหมด -');
        this.setDashboardText('dashboard-easyslip-message', healthState === 'healthy'
            ? (quotaPercent <= 20 ? 'โควตาใกล้หมด ควรเตรียมเพิ่มแพ็กเกจ' : 'ระบบตรวจสอบสลิปอัตโนมัติทำงานปกติ')
            : 'ระบบตรวจสลิปอัตโนมัติต้องได้รับการตรวจสอบ');
        const quotaBar = document.getElementById('dashboard-easyslip-bar');
        if (quotaBar) quotaBar.style.width = `${quotaPercent}%`;

        const alertList = document.getElementById('dashboard-alerts');
        const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
        if (alertList) {
            const icons = { success: 'circle-check', warning: 'triangle-alert', critical: 'octagon-alert' };
            alertList.innerHTML = alerts.map(alert => `
                <div class="dashboard-alert ${App.escapeHTML(alert.severity || 'warning')}">
                    <i data-lucide="${icons[alert.severity] || icons.warning}"></i>
                    <div><strong>${App.escapeHTML(alert.title || 'แจ้งเตือน')}</strong><span>${App.escapeHTML(alert.message || '')}</span></div>
                </div>`).join('');
        }
        const actionableAlerts = alerts.filter(alert => alert.severity !== 'success').length;
        this.setDashboardText('dashboard-alert-count', actionableAlerts ? `${integer(actionableAlerts)} รายการต้องดูแล` : 'ทุกระบบปกติ');

        const trendContainer = document.getElementById('dashboard-revenue-trend');
        const trendRows = Array.isArray(data?.revenueTrend) ? data.revenueTrend : [];
        const trendMap = new Map(trendRows.map(item => [String(item.day), Number(item.amount) || 0]));
        const trend = [];
        const trendEnd = new Date(data?.generatedAt || Date.now());
        for (let offset = 6; offset >= 0; offset -= 1) {
            const day = new Date(trendEnd.getTime() - (offset * 86400000));
            const key = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(day);
            trend.push({ day: key, amount: trendMap.get(key) || 0 });
        }
        const maximumTrend = Math.max(1, ...trend.map(item => Number(item.amount) || 0));
        if (trendContainer) {
            trendContainer.innerHTML = trend.map(item => {
                const amount = Number(item.amount) || 0;
                const date = new Date(`${item.day}T00:00:00+07:00`);
                const label = Number.isNaN(date.getTime()) ? item.day : date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' });
                const height = amount > 0 ? Math.max(7, (amount / maximumTrend) * 100) : 3;
                return `<div class="dashboard-trend-day" title="${App.escapeHTML(this.formatDashboardMoney(amount))}"><div class="dashboard-trend-bar-wrap"><i class="dashboard-trend-bar" style="height:${height}%"></i></div><strong>${App.escapeHTML(label)}</strong><span>${amount ? this.formatDashboardMoney(amount) : '฿0'}</span></div>`;
            }).join('');
        }
        this.setDashboardText('dashboard-trend-total', `รวม ${this.formatDashboardMoney(trend.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}`);
        this.setDashboardText('dashboard-updated-at', data?.generatedAt
            ? `อัปเดต ${new Date(data.generatedAt).toLocaleString('th-TH')}`
            : 'อัปเดตล่าสุดไม่สำเร็จ');
        App.renderIcons();
    },

    async loadDashboard(forceRefresh = false) {
        if (this.dashboardLoading) return;
        const refreshButton = document.getElementById('dashboard-refresh');
        if (!refreshButton) return;
        this.dashboardLoading = true;
        refreshButton.disabled = true;
        refreshButton.classList.add('is-loading');
        try {
            const suffix = forceRefresh ? '?refresh=1' : '';
            const res = await this.fetchAdmin(`/api/admin/dashboard${suffix}`, { cache: 'no-store' });
            this.renderDashboard(res.dashboard);
        } catch (error) {
            this.setDashboardText('dashboard-updated-at', 'โหลด Dashboard ไม่สำเร็จ');
            console.error('Failed to load dashboard', error);
        } finally {
            this.dashboardLoading = false;
            refreshButton.disabled = false;
            refreshButton.classList.remove('is-loading');
            App.renderIcons();
        }
    },

    // --- SYSTEM STATUS & SETTINGS ---
    async loadSystemStatus() {
        this.loadEasySlipHealth(false);
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
            document.getElementById('setting-easyslip-key').value = s.EASYSLIP_API_KEY || '';
            
            document.getElementById('setting-promo-badge').value = s.PROMO_BADGE || 'PROMOTION';
            document.getElementById('setting-promo-title').value = s.PROMO_TITLE || 'เติมเงินคูณ 2 ต้อนรับซีซั่นใหม่!';
            document.getElementById('setting-promo-subtitle').value = s.PROMO_SUBTITLE || 'รับคะแนนคูณสองฟรีทุกช่องทางการเติมเงิน ตลอดสัปดาห์นี้เท่านั้น ยศราคาพิเศษลด 20% ทั้งเซิร์ฟเวอร์!';
            document.getElementById('setting-promo-image').value = s.PROMO_IMAGE || 'images/promo.png';
            document.getElementById('setting-promo-file').value = '';
            
        } catch(e) {
            console.error('Failed to load system status', e);
        }
    },

    setEasySlipHealthText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    },

    renderEasySlipHealth(health) {
        const state = String(health?.state || 'unavailable');
        const card = document.getElementById('easyslip-health-card');
        const badge = document.getElementById('easyslip-health-badge');
        const quotaBar = document.getElementById('easyslip-health-quota-bar');
        const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
        const numericOrNull = value => {
            if (value === null || value === undefined || value === '') return null;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        };
        const stateLabels = {
            healthy: 'พร้อมใช้งาน',
            degraded: 'ต้องตรวจสอบ',
            unavailable: 'เชื่อมต่อไม่ได้',
            blocked: 'ถูกระงับ/ตั้งค่าไม่ถูกต้อง',
            disabled: 'ยังไม่ได้เปิดใช้งาน'
        };
        const errorCode = health?.credentials?.error?.code || health?.service?.error?.code || '';
        let summary = 'EasySlip พร้อมตรวจสอบสลิปอัตโนมัติ';
        if (state === 'disabled') {
            summary = 'ยังไม่ได้ตั้งค่า EasySlip API Key ระบบจะส่งสลิปเข้าคิวให้ทีมงานตรวจสอบแทน';
        } else if (state === 'blocked') {
            const blockedMessages = {
                INVALID_API_KEY: 'API Key ไม่ถูกต้อง กรุณาตรวจสอบคีย์แล้วบันทึกการตั้งค่าใหม่',
                MISSING_API_KEY: 'ไม่พบ API Key กรุณาตั้งค่าคีย์ก่อนเปิดตรวจสลิปอัตโนมัติ',
                IP_NOT_ALLOWED: 'IP ของเซิร์ฟเวอร์นี้ไม่ได้อยู่ใน EasySlip Whitelist',
                BRANCH_INACTIVE: 'EasySlip Branch นี้ถูกปิดใช้งาน',
                SERVICE_BANNED: 'บริการ EasySlip ของบัญชีนี้ถูกระงับ',
                USER_BANNED: 'บัญชี EasySlip ถูกระงับการใช้งาน'
            };
            summary = blockedMessages[errorCode] || 'EasySlip ปฏิเสธการเชื่อมต่อ กรุณาตรวจสอบบัญชี Branch และ API Key';
        } else if (state === 'unavailable') {
            summary = 'ไม่สามารถเชื่อมต่อ EasySlip ได้ในขณะนี้ รายการใหม่จะถูกเก็บไว้ให้ทีมงานตรวจสอบ';
        } else if (state === 'degraded') {
            summary = Number(health?.quota?.remaining) === 0
                ? 'โควตา EasySlip หมดแล้ว รายการใหม่จะไม่สามารถอนุมัติอัตโนมัติได้'
                : 'EasySlip ตอบกลับได้บางส่วน กรุณาตรวจสอบรายละเอียดก่อนรับรายการจริง';
        }

        card.dataset.state = state;
        badge.className = `easyslip-health-badge ${state}`;
        this.setEasySlipHealthText('easyslip-health-badge-text', stateLabels[state] || stateLabels.unavailable);
        this.setEasySlipHealthText('easyslip-health-summary', summary);

        const reachable = health?.service?.reachable === true;
        this.setEasySlipHealthText(
            'easyslip-health-service',
            state === 'disabled' ? 'Disabled' : (reachable ? 'Online' : 'Offline')
        );
        const latency = numericOrNull(health?.service?.latencyMs);
        this.setEasySlipHealthText('easyslip-health-latency', latency === null ? '-' : `${numberFormat.format(latency)} ms`);

        const quota = health?.quota || {};
        const remaining = numericOrNull(quota.remaining);
        const max = numericOrNull(quota.max);
        const used = numericOrNull(quota.used);
        this.setEasySlipHealthText(
            'easyslip-health-quota',
            remaining === null ? (max === null && state === 'healthy' ? 'ไม่จำกัด' : '-') : numberFormat.format(remaining)
        );
        this.setEasySlipHealthText(
            'easyslip-health-quota-used',
            used === null
                ? 'ไม่มีข้อมูลการใช้งาน'
                : `ใช้แล้ว ${numberFormat.format(used)}${max === null ? '' : ` / ${numberFormat.format(max)}`}`
        );
        const percentUsed = numericOrNull(quota.percentUsed);
        quotaBar.style.width = percentUsed !== null
            ? `${Math.max(0, Math.min(100, percentUsed))}%`
            : '0%';

        const accountCredit = numericOrNull(health?.account?.credit);
        const credit = accountCredit !== null
            ? `${numberFormat.format(accountCredit)} เครดิต`
            : '-';
        this.setEasySlipHealthText('easyslip-health-credit', credit);

        const configured = health?.configured === true;
        const keyValid = health?.credentials?.valid;
        this.setEasySlipHealthText(
            'easyslip-health-key',
            !configured ? 'Not configured' : (keyValid === true ? 'Valid & authenticated' : keyValid === false ? 'Invalid' : 'ตรวจสอบไม่ได้')
        );
        const branch = health?.branch || {};
        const branchState = branch.isActive === true ? 'Active' : branch.isActive === false ? 'Inactive' : 'Unknown';
        this.setEasySlipHealthText(
            'easyslip-health-branch',
            branch.name ? `${branch.name} • ${branchState}` : branchState
        );
        this.setEasySlipHealthText('easyslip-health-package', health?.product?.name || '-');

        const last = health?.lastVerification;
        let lastText = 'ยังไม่มีรายการตรวจสอบ';
        if (last) {
            const date = last.approvedAt || last.createdAt;
            const timeText = date ? new Date(date).toLocaleString('th-TH') : '-';
            lastText = `${String(last.status || 'unknown').toUpperCase()} • ${timeText}`;
        }
        this.setEasySlipHealthText('easyslip-health-last', lastText);
        this.setEasySlipHealthText(
            'easyslip-health-checked',
            health?.checkedAt ? `ตรวจล่าสุด ${new Date(health.checkedAt).toLocaleString('th-TH')}` : 'ยังไม่ได้ตรวจสอบ'
        );
        this.setEasySlipHealthText(
            'easyslip-health-source',
            health?.cached ? 'ข้อมูล cache ภายใน 30 วินาที' : 'เรียกข้อมูลจาก EasySlip โดยตรง'
        );
        App.renderIcons();
    },

    async loadEasySlipHealth(forceRefresh = false) {
        if (this.easySlipHealthLoading) return;
        const refreshButton = document.getElementById('easyslip-health-refresh');
        const badge = document.getElementById('easyslip-health-badge');
        const card = document.getElementById('easyslip-health-card');
        if (!refreshButton || !badge || !card) return;

        this.easySlipHealthLoading = true;
        refreshButton.disabled = true;
        refreshButton.classList.add('is-loading');
        card.dataset.state = 'checking';
        badge.className = 'easyslip-health-badge checking';
        this.setEasySlipHealthText('easyslip-health-badge-text', 'กำลังตรวจสอบ');
        this.setEasySlipHealthText('easyslip-health-summary', 'กำลังเชื่อมต่อ EasySlip เพื่อตรวจสอบบริการและโควตา');
        App.renderIcons();

        try {
            const suffix = forceRefresh ? '?refresh=1' : '';
            const res = await App.api(`/api/admin/easyslip-health${suffix}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(App.translateError(res.error));
            this.renderEasySlipHealth(res.health);
        } catch (error) {
            this.renderEasySlipHealth({
                state: 'unavailable',
                configured: true,
                checkedAt: new Date().toISOString(),
                service: { reachable: false, latencyMs: null, error: { code: 'INTERNAL_REQUEST_FAILED' } },
                credentials: { valid: null },
                quota: {},
                account: {},
                branch: {},
                product: {},
                lastVerification: null
            });
            console.error('Failed to load EasySlip health', error);
        } finally {
            this.easySlipHealthLoading = false;
            refreshButton.disabled = false;
            refreshButton.classList.remove('is-loading');
            App.renderIcons();
        }
    },

    async regenerateToken() {
        const result = await Swal.fire({ title: 'Are you sure?', text: 'All connected Minecraft servers will be disconnected until they update their config.', icon: 'warning', showCancelButton: true, background: '#1a1f2b', color: '#fff' });
        if (!result.isConfirmed) return;
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
        let promoImageVal = document.getElementById('setting-promo-image').value;
        const promoFile = document.getElementById('setting-promo-file').files[0];
        if (promoFile) {
            try {
                promoImageVal = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(promoFile);
                });
            } catch (err) {
                App.showToast('Error reading promo image file');
                return;
            }
        }

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
            EASYSLIP_API_KEY: document.getElementById('setting-easyslip-key').value,
            PROMO_BADGE: document.getElementById('setting-promo-badge').value,
            PROMO_TITLE: document.getElementById('setting-promo-title').value,
            PROMO_SUBTITLE: document.getElementById('setting-promo-subtitle').value,
            PROMO_IMAGE: promoImageVal
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
    async loadPlayers() {
        const q = document.getElementById('player-search-input').value.trim();
        let url = '/api/admin/players';
        if (q) url = `/api/admin/players/search?q=${encodeURIComponent(q)}`;
        
        const res = await this.fetchAdmin(url);
        const tbody = document.getElementById('player-search-tbody');
        tbody.innerHTML = '';
        if (res.players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No players found</td></tr>';
            return;
        }

        const playersData = res.players.map(p => ({
            ...p,
            points: Number(p.balance_points) || 0,
            totalTopupTHB: (Number(p.total_topup_minor) || 0) / 100
        }));

        playersData.sort((a, b) => a.username.localeCompare(b.username));

        playersData.forEach(p => {
            const tr = document.createElement('tr');
            const registrationHint = p.registered_on_web
                ? ''
                : '<small style="display:block; color:#f59e0b; margin-top:3px;">ยังไม่ผูกบัญชีหน้าเว็บ</small>';
            tr.innerHTML = `
                <td>${p.id}</td>
                <td>${App.escapeHTML(p.username)}${registrationHint}</td>
                <td>${App.escapeHTML(p.email || '-')}</td>
                <td style="color:#f59e0b; font-weight:bold;">${p.points.toLocaleString('th-TH')} <i data-lucide="coins"></i></td>
                <td style="color:#10b981; font-weight:bold;">${p.totalTopupTHB.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
                <td>${p.last_seen ? new Date(p.last_seen).toLocaleString() : '-'}</td>
                <td><button class="submit-login-btn btn-view-profile" style="padding:6px 12px; width:auto">View Profile</button></td>
            `;
            tr.querySelector('.btn-view-profile').onclick = () => Admin.viewPlayerProfile(p.username);
            tbody.appendChild(tr);
        });
        App.renderIcons();
    },

    async viewPlayerProfile(username) {
        // Hide search, show profile
        document.getElementById('player-search-results').style.display = 'none';
        document.getElementById('player-profile-view').style.display = 'block';
        
        // Fetch the nLogin profile first, then use the wallet-specific endpoint
        // as the authoritative source for current balance and ledger history.
        const res = await this.fetchAdmin(`/api/admin/players/${encodeURIComponent(username)}`);
        const p = res.player;
        let walletRes = {
            player: { balance_points: Number(p.balance_points) || 0 },
            transactions: []
        };
        if (p.registered_on_web !== false) {
            walletRes = await this.fetchAdmin(`/api/admin/wallet/player/${encodeURIComponent(p.username)}`);
        }
        const userTxs = Array.isArray(walletRes.transactions) ? walletRes.transactions : [];
        
        document.getElementById('profile-username').innerText = p.username;
        document.getElementById('profile-email').innerText = p.email || '-';
        document.getElementById('profile-created').innerText = p.created_at ? new Date(p.created_at).toLocaleString() : '-';
        document.getElementById('profile-lastseen').innerText = p.last_seen ? new Date(p.last_seen).toLocaleString() : '-';
        
        // Client-side Relation Filtering
        // 1. Wallet Balance
        const currentBalance = Number(walletRes.player?.balance_points) || 0;
        document.getElementById('profile-balance').innerText = currentBalance.toLocaleString('th-TH');

        // 2. Orders
        const userOrders = this.globalData.orders.filter(o => o.username === p.username);
        const oTbody = document.getElementById('profile-orders-tbody');
        oTbody.innerHTML = '';
        if (userOrders.length === 0) {
            oTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No recent orders found</td></tr>';
        }
        
        const orderIds = new Set();
        userOrders.forEach(o => {
            orderIds.add(String(o.id));
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${App.escapeHTML(o.id)}</td>
                <td><span class="order-items-summary">${App.escapeHTML(this.getOrderItemsSummary(o))}</span></td>
                <td>${Number(o.total_points).toLocaleString('th-TH')}</td>
                <td>${this.renderOrderStatusBadge(o.status)}</td>
                <td>${new Date(o.created_at).toLocaleString('th-TH')}</td>
            `;
            oTbody.appendChild(tr);
        });

        // 3. Topup / Wallet Transactions
        const pTbody = document.getElementById('profile-topup-tbody');
        if (pTbody) {
            pTbody.innerHTML = '';
            if (userTxs.length === 0) {
                pTbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No recent wallet transactions found</td></tr>';
            } else {
                userTxs.forEach(t => {
                    const tr = document.createElement('tr');
                    const color = t.type === 'credit' ? 'var(--success)' : 'var(--danger)';
                    tr.innerHTML = `<td>${t.id}</td><td style="color:${color}; font-weight:bold;">${App.escapeHTML(t.type).toUpperCase()}</td><td>${Number(t.amount_points).toLocaleString('th-TH')}</td><td>${Number(t.balance_after).toLocaleString('th-TH')}</td><td>${new Date(t.created_at).toLocaleString()}</td>`;
                    pTbody.appendChild(tr);
                });
            }
        }

        // 4. Delivery Jobs (matched by orderIds)
        const userJobs = this.globalData.jobs.filter(j => orderIds.has(String(j.order_id)));
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
        this.openWalletModal(action, username);
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
                <td><span class="badge" style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">${App.escapeHTML(p.category || 'Rank')}</span></td>
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
        document.getElementById('prod-category').value = 'Rank';
        document.getElementById('prod-desc').value = '';
        document.getElementById('prod-price').value = '';
        document.getElementById('prod-cmd').value = '';
        document.getElementById('prod-active').value = '1';
        document.getElementById('prod-image').value = '';
        document.getElementById('product-modal-title').innerText = 'Create Product';
        document.getElementById('btn-delete-product').style.display = 'none';
        document.getElementById('product-modal').classList.add('active');
    },

    editProduct(p) {
        document.getElementById('prod-id').value = p.id;
        document.getElementById('prod-sku').value = p.sku;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-category').value = p.category || 'Rank';
        document.getElementById('prod-desc').value = p.description;
        document.getElementById('prod-price').value = p.price_points;
        document.getElementById('prod-cmd').value = p.minecraft_command;
        document.getElementById('prod-active').value = p.active;
        document.getElementById('prod-image').value = '';
        document.getElementById('product-modal-title').innerText = 'Edit Product';
        document.getElementById('btn-delete-product').style.display = 'inline-flex';
        document.getElementById('product-modal').classList.add('active');
    },

    async deleteProduct() {
        const result = await Swal.fire({ title: 'ยืนยันที่จะลบสินค้านี้ใช่หรือไม่?', text: 'การกระทำนี้ไม่สามารถย้อนกลับได้', icon: 'warning', showCancelButton: true, background: '#1a1f2b', color: '#fff' });
        if (!result.isConfirmed) return;
        const id = document.getElementById('prod-id').value;
        if (!id) return;
        try {
            await this.fetchAdmin(`/api/products/${id}`, { method: 'DELETE' });
            document.getElementById('product-modal').classList.remove('active');
            App.showToast('ลบสินค้าเรียบร้อยแล้ว');
            this.loadProducts();
        } catch (e) {
            console.error(e);
        }
    },

    async saveProduct(e) {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        const payload = {
            sku: document.getElementById('prod-sku').value,
            name: document.getElementById('prod-name').value,
            category: document.getElementById('prod-category').value,
            description: document.getElementById('prod-desc').value,
            price_points: parseInt(document.getElementById('prod-price').value),
            minecraft_command: document.getElementById('prod-cmd').value,
            active: parseInt(document.getElementById('prod-active').value)
        };

        const imageFile = document.getElementById('prod-image').files[0];
        if (imageFile) {
            try {
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(imageFile);
                });
                payload.image = base64;
            } catch (err) {
                App.showToast('Error reading image file');
                return;
            }
        }

        const path = id ? `/api/products/${id}` : '/api/products';
        const method = id ? 'PATCH' : 'POST';

        await this.fetchAdmin(path, { method, body: JSON.stringify(payload) });
        document.getElementById('product-modal').classList.remove('active');
        App.showToast('Product saved successfully');
        this.loadProducts();
    },

    // --- ORDERS ---
    getOrderItemsSummary(order) {
        const items = Array.isArray(order?.items) ? order.items : [];
        if (!items.length) return 'ไม่พบรายละเอียดสินค้า';

        const visible = items.slice(0, 2).map(item => {
            const quantity = Number(item.quantity) || 0;
            return `${item.name || `Product #${item.productId || '-'}`} ×${quantity}`;
        });
        if (items.length > visible.length) visible.push(`+${items.length - visible.length} รายการ`);
        return visible.join(', ');
    },

    renderOrderStatusBadge(status) {
        const states = {
            pending_delivery: { label: 'กำลังจัดส่ง', className: 'pending' },
            delivered: { label: 'ส่งสำเร็จ', className: 'success' },
            delivery_failed: { label: 'ส่งไม่สำเร็จ', className: 'failed' }
        };
        const state = states[String(status || '')] || { label: String(status || 'Unknown'), className: 'neutral' };
        return `<span class="order-status-badge ${state.className}">${App.escapeHTML(state.label)}</span>`;
    },

    getOrderItemDeliveryState(item) {
        const delivery = item?.delivery || {};
        const quantity = Number(item?.quantity) || 0;
        const succeeded = Number(delivery.succeeded) || 0;
        const failed = Number(delivery.failed) || 0;
        const pending = Number(delivery.pending) || 0;

        if (failed > 0) {
            return { className: 'failed', label: `ไม่สำเร็จ ${failed} ชิ้น`, detail: `สำเร็จ ${succeeded} • รอดำเนินการ ${pending}` };
        }
        if (pending > 0 || succeeded < quantity) {
            return { className: 'pending', label: `กำลังส่ง ${Math.max(pending, quantity - succeeded)} ชิ้น`, detail: `สำเร็จแล้ว ${succeeded}/${quantity}` };
        }
        return { className: 'success', label: `ส่งสำเร็จ ${succeeded}/${quantity}`, detail: 'คำสั่งถูกส่งเข้าเซิร์ฟเวอร์แล้ว' };
    },

    async loadOrders() {
        const res = await this.fetchAdmin('/api/admin/orders');
        this.globalData.orders = Array.isArray(res.orders) ? res.orders : [];
        const tbody = document.getElementById('orders-tbody');
        tbody.innerHTML = '';
        if (this.globalData.orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">ยังไม่มีคำสั่งซื้อ</td></tr>';
            return;
        }

        this.globalData.orders.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong class="order-id">#${App.escapeHTML(o.id)}</strong></td>
                <td>${App.escapeHTML(o.username)}</td>
                <td><span class="order-items-summary">${App.escapeHTML(this.getOrderItemsSummary(o))}</span></td>
                <td><strong>${Number(o.total_points).toLocaleString('th-TH')}</strong></td>
                <td>${this.renderOrderStatusBadge(o.status)}</td>
                <td>${new Date(o.created_at).toLocaleString('th-TH')}</td>
                <td><button type="button" class="action-btn btn-edit order-detail-button"><i data-lucide="eye"></i> ดูรายละเอียด</button></td>
            `;
            tr.querySelector('.order-detail-button').onclick = () => this.openOrderDetails(o.id);
            tbody.appendChild(tr);
        });
        App.renderIcons();
    },

    openOrderDetails(orderId) {
        const order = this.globalData.orders.find(item => String(item.id) === String(orderId));
        if (!order) {
            App.showToast('ไม่พบรายละเอียดคำสั่งซื้อนี้', 'error');
            return;
        }

        const items = Array.isArray(order.items) ? order.items : [];
        const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        document.getElementById('order-detail-id').textContent = order.id;
        document.getElementById('order-detail-player').textContent = order.username || '-';
        document.getElementById('order-detail-points').textContent = `${Number(order.total_points).toLocaleString('th-TH')} Points`;
        document.getElementById('order-detail-status').innerHTML = this.renderOrderStatusBadge(order.status);
        document.getElementById('order-detail-date').textContent = new Date(order.created_at).toLocaleString('th-TH');
        document.getElementById('order-detail-item-count').textContent = `${items.length} รายการ • ${totalQuantity} ชิ้น`;

        const container = document.getElementById('order-detail-items');
        if (!items.length) {
            container.innerHTML = '<div class="order-detail-empty"><i data-lucide="package-x"></i><strong>ไม่พบรายละเอียดสินค้า</strong><span>ออเดอร์เก่าอาจถูกสร้างก่อนระบบบันทึกรายการสินค้า</span></div>';
        } else {
            container.innerHTML = items.map(item => {
                const delivery = this.getOrderItemDeliveryState(item);
                const quantity = Number(item.quantity) || 0;
                const unitPrice = Number(item.unitPricePoints) || 0;
                const totalPoints = Number(item.totalPoints) || (quantity * unitPrice);
                return `
                    <article class="order-detail-item">
                        <span class="order-detail-product-icon"><i data-lucide="box"></i></span>
                        <div class="order-detail-product-copy">
                            <strong>${App.escapeHTML(item.name || `Product #${item.productId || '-'}`)}</strong>
                            <code>${App.escapeHTML(item.sku || 'unknown')}</code>
                        </div>
                        <div class="order-detail-price">
                            <small>QUANTITY</small>
                            <strong>×${quantity}</strong>
                            <span>${unitPrice.toLocaleString('th-TH')} / ชิ้น</span>
                        </div>
                        <div class="order-detail-price total">
                            <small>LINE TOTAL</small>
                            <strong>${totalPoints.toLocaleString('th-TH')}</strong>
                            <span>Points</span>
                        </div>
                        <div class="order-delivery-state ${delivery.className}">
                            <span>${App.escapeHTML(delivery.label)}</span>
                            <small>${App.escapeHTML(delivery.detail)}</small>
                        </div>
                    </article>
                `;
            }).join('');
        }

        document.getElementById('order-detail-modal').classList.add('active');
        App.renderIcons();
    },

    closeOrderDetails() {
        document.getElementById('order-detail-modal').classList.remove('active');
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
        const result = await Swal.fire({ title: 'Are you sure?', text: 'Are you sure you want to retry this delivery job?', icon: 'warning', showCancelButton: true, background: '#1a1f2b', color: '#fff' });
        if (!result.isConfirmed) return;
        await this.fetchAdmin(`/api/admin/delivery-jobs/${id}/retry`, { method: 'POST' });
        App.showToast('Job queued for retry');
        this.loadDelivery();
    },

    // --- WALLET ---
    async loadWallet() {
        const res = await this.fetchAdmin('/api/admin/wallet');
        this.globalData.transactions = res.transactions;
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

    openWalletModal(action = 'credit', username = '') {
        document.getElementById('wallet-username').value = username;
        document.getElementById('wallet-action').value = action === 'debit' ? 'debit' : 'credit';
        document.getElementById('wallet-amount').value = '';
        document.getElementById('wallet-modal').classList.add('active');
    },

    async saveWallet(e) {
        e.preventDefault();
        const username = document.getElementById('wallet-username').value.trim();
        const action = document.getElementById('wallet-action').value;
        const amount = parseInt(document.getElementById('wallet-amount').value, 10);

        const res = await this.fetchAdmin(`/api/admin/wallet/${action}`, {
            method: 'POST',
            body: JSON.stringify({ username, amount_points: amount })
        });
        
        if (res.ok) {
            Swal.fire({
                icon: 'success',
                title: 'สำเร็จ',
                text: `${action === 'credit' ? 'เพิ่ม' : 'ลด'} ${amount.toLocaleString('th-TH')} พอยท์ให้ ${username} แล้ว`,
                timer: 1800,
                showConfirmButton: false,
                background: '#1a1f2b',
                color: '#fff'
            });
        }
        
        document.getElementById('wallet-modal').classList.remove('active');
        await Promise.allSettled([this.loadWallet(), this.loadPlayers()]);
        
        // If we are currently viewing the player profile for this user, refresh it
        if (document.getElementById('players').classList.contains('active') && document.getElementById('player-profile-view').style.display === 'block') {
            if (document.getElementById('profile-username').innerText.toLowerCase() === username.toLowerCase()) {
                await this.viewPlayerProfile(username);
            }
        }
    },

    // --- MANUAL TOPUP ---
    async openManualTopupModal(username = '') {
        const form = document.getElementById('manual-topup-form');
        const modal = document.getElementById('manual-topup-modal');
        const usernameInput = document.getElementById('manual-topup-username');
        const playerState = document.getElementById('manual-topup-player-state');

        form.reset();
        usernameInput.value = String(username || '').trim();
        this.manualTopup.pointRate = null;
        this.manualTopup.player = null;
        this.manualTopup.lookupRequest += 1;
        this.manualTopup.submitting = false;
        playerState.style.color = '#94a3b8';
        playerState.textContent = 'กำลังโหลดอัตราแลกพอยท์จากระบบ...';
        modal.classList.add('active');
        this.updateManualTopupPreview();
        App.renderIcons();

        try {
            const config = await this.fetchAdmin('/api/topup/config');
            const pointRate = Number(config.pointRate);
            if (!Number.isFinite(pointRate) || pointRate <= 0) {
                throw new Error(App.translateError('invalid_point_rate'));
            }
            this.manualTopup.pointRate = pointRate;

            if (usernameInput.value) {
                await this.lookupManualTopupPlayer();
            } else {
                playerState.style.color = '#94a3b8';
                playerState.textContent = `ผู้เล่นต้องเคยเข้าสู่ระบบหน้าเว็บอย่างน้อยหนึ่งครั้ง • เรต ${pointRate.toLocaleString('th-TH')} พอยท์/บาท`;
                this.updateManualTopupPreview();
            }
        } catch (error) {
            playerState.style.color = '#ef4444';
            playerState.textContent = 'โหลดอัตราแลกพอยท์ไม่สำเร็จ กรุณาปิดหน้าต่างแล้วลองใหม่';
            this.updateManualTopupPreview();
        }
    },

    async lookupManualTopupPlayer() {
        const usernameInput = document.getElementById('manual-topup-username');
        const playerState = document.getElementById('manual-topup-player-state');
        const username = usernameInput.value.trim();
        const requestId = ++this.manualTopup.lookupRequest;

        this.manualTopup.player = null;
        this.updateManualTopupPreview();

        if (!username) {
            playerState.style.color = '#94a3b8';
            playerState.textContent = 'กรุณากรอกชื่อผู้เล่น';
            return null;
        }

        playerState.style.color = '#94a3b8';
        playerState.textContent = 'กำลังตรวจสอบบัญชีผู้เล่น...';

        try {
            const res = await App.api(`/api/admin/wallet/player/${encodeURIComponent(username)}`);
            if (requestId !== this.manualTopup.lookupRequest) return null;

            if (!res.ok) {
                playerState.style.color = '#ef4444';
                playerState.textContent = App.translateError(res.error);
                this.updateManualTopupPreview();
                return null;
            }

            this.manualTopup.player = {
                ...res.player,
                balance_points: Number(res.player.balance_points) || 0
            };
            usernameInput.value = res.player.username;
            playerState.style.color = '#22c55e';
            playerState.textContent = `พบบัญชี ${res.player.username} • ยอดปัจจุบัน ${this.manualTopup.player.balance_points.toLocaleString('th-TH')} พอยท์`;
            this.updateManualTopupPreview();
            return this.manualTopup.player;
        } catch (error) {
            if (requestId !== this.manualTopup.lookupRequest) return null;
            playerState.style.color = '#ef4444';
            playerState.textContent = 'ตรวจสอบผู้เล่นไม่สำเร็จ กรุณาลองใหม่';
            this.updateManualTopupPreview();
            return null;
        }
    },

    calculateManualTopupPoints(amountMinor, pointRate) {
        const normalizedRate = String(pointRate).trim().toLowerCase();
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/.test(normalizedRate)) return null;

        try {
            const [coefficient, exponentPart = '0'] = normalizedRate.split('e');
            const [wholePart, fractionPart = ''] = coefficient.split('.');
            const exponent = Number(exponentPart);
            const digits = `${wholePart}${fractionPart}`.replace(/^0+/, '') || '0';
            const decimalPlaces = fractionPart.length - exponent;

            let rateNumerator = BigInt(digits);
            let rateDenominator = 1n;
            if (decimalPlaces > 0) {
                rateDenominator = 10n ** BigInt(decimalPlaces);
            } else if (decimalPlaces < 0) {
                rateNumerator *= 10n ** BigInt(-decimalPlaces);
            }

            const divisor = 100n * rateDenominator;
            const scaledPoints = BigInt(amountMinor) * rateNumerator;
            return Number((scaledPoints + (divisor / 2n)) / divisor);
        } catch (_) {
            return null;
        }
    },

    updateManualTopupPreview() {
        const usernameInput = document.getElementById('manual-topup-username');
        const amountInput = document.getElementById('manual-topup-amount');
        const pointsElement = document.getElementById('manual-topup-points');
        const afterBalanceElement = document.getElementById('manual-topup-after-balance');
        const submitButton = document.getElementById('manual-topup-submit');
        if (!usernameInput || !amountInput || !pointsElement || !afterBalanceElement || !submitButton) return null;

        const rawAmount = amountInput.value.trim();
        const amountMatch = rawAmount.match(/^(\d{1,7})(?:\.(\d{0,2}))?$/);
        const pointRate = Number(this.manualTopup.pointRate);
        let calculation = null;

        if (amountMatch && Number.isFinite(pointRate) && pointRate > 0) {
            const amountMinor = (Number(amountMatch[1]) * 100) + Number((amountMatch[2] || '').padEnd(2, '0'));
            const points = this.calculateManualTopupPoints(amountMinor, pointRate);
            if (
                Number.isSafeInteger(amountMinor) &&
                amountMinor > 0 &&
                amountMinor <= 100000000 &&
                Number.isSafeInteger(points) &&
                points > 0 &&
                points <= 10000000
            ) {
                calculation = {
                    amountMinor,
                    amountBaht: (amountMinor / 100).toFixed(2),
                    points
                };
            }
        }

        const currentUsername = usernameInput.value.trim().toLowerCase();
        const matchedPlayer = this.manualTopup.player &&
            this.manualTopup.player.username.toLowerCase() === currentUsername;

        pointsElement.textContent = calculation ? calculation.points.toLocaleString('th-TH') : '0';
        afterBalanceElement.textContent = calculation && matchedPlayer
            ? (this.manualTopup.player.balance_points + calculation.points).toLocaleString('th-TH')
            : '-';
        submitButton.disabled = this.manualTopup.submitting || !calculation || !matchedPlayer;
        submitButton.style.opacity = submitButton.disabled ? '0.55' : '1';
        submitButton.style.cursor = submitButton.disabled ? 'not-allowed' : 'pointer';

        return calculation;
    },

    async saveManualTopup(e) {
        e.preventDefault();
        if (this.manualTopup.submitting) return;

        const form = document.getElementById('manual-topup-form');
        if (!form.reportValidity()) return;

        const usernameInput = document.getElementById('manual-topup-username');
        const username = usernameInput.value.trim();
        let matchedPlayer = this.manualTopup.player &&
            this.manualTopup.player.username.toLowerCase() === username.toLowerCase();
        if (!matchedPlayer) {
            await this.lookupManualTopupPlayer();
            matchedPlayer = this.manualTopup.player &&
                this.manualTopup.player.username.toLowerCase() === usernameInput.value.trim().toLowerCase();
        }
        if (!matchedPlayer) return;

        const calculation = this.updateManualTopupPreview();
        if (!calculation) {
            Swal.fire({
                icon: 'error',
                title: 'จำนวนเงินไม่ถูกต้อง',
                text: App.translateError('invalid_amount'),
                background: '#1a1f2b',
                color: '#fff'
            });
            return;
        }

        const canonicalUsername = this.manualTopup.player.username;
        const transactionReference = document.getElementById('manual-topup-reference').value.trim();
        const reason = document.getElementById('manual-topup-reason').value.trim();
        const submitButton = document.getElementById('manual-topup-submit');

        this.manualTopup.submitting = true;
        this.updateManualTopupPreview();

        const confirmation = await Swal.fire({
            icon: 'warning',
            title: 'ยืนยันบันทึกเติมเงินด้วยมือ',
            text: `${canonicalUsername} โอน ${Number(calculation.amountBaht).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท และจะได้รับ ${calculation.points.toLocaleString('th-TH')} พอยท์ โปรดตรวจสอบเลขอ้างอิงบนสลิปอีกครั้ง`,
            showCancelButton: true,
            confirmButtonText: 'ยืนยันและเติมพอยท์',
            cancelButtonText: 'กลับไปตรวจสอบ',
            confirmButtonColor: '#d4af37',
            background: '#1a1f2b',
            color: '#fff'
        });

        if (!confirmation.isConfirmed) {
            this.manualTopup.submitting = false;
            this.updateManualTopupPreview();
            return;
        }

        submitButton.innerHTML = '<i data-lucide="loader-circle"></i> กำลังบันทึก...';
        App.renderIcons();

        try {
            const res = await this.fetchAdmin('/api/admin/topup/manual', {
                method: 'POST',
                body: JSON.stringify({
                    username: canonicalUsername,
                    amount_baht: calculation.amountBaht,
                    transaction_reference: transactionReference,
                    reason
                })
            });

            document.getElementById('manual-topup-modal').classList.remove('active');
            await Promise.allSettled([
                this.loadTopup(),
                this.loadWallet(),
                this.loadPlayers()
            ]);

            const profileIsOpen = document.getElementById('players').classList.contains('active') &&
                document.getElementById('player-profile-view').style.display === 'block' &&
                document.getElementById('profile-username').innerText.toLowerCase() === canonicalUsername.toLowerCase();
            if (profileIsOpen) {
                await Promise.allSettled([this.viewPlayerProfile(canonicalUsername)]);
            }

            const topup = res.topup;
            await Swal.fire({
                icon: topup.idempotent ? 'info' : 'success',
                title: topup.idempotent ? 'รายการนี้ถูกบันทึกไว้แล้ว' : 'เติมเงินสำเร็จ',
                text: `${topup.username} ได้รับ ${Number(topup.points).toLocaleString('th-TH')} พอยท์ ยอดคงเหลือ ${Number(topup.balance_points).toLocaleString('th-TH')} พอยท์`,
                background: '#1a1f2b',
                color: '#fff'
            });
        } finally {
            this.manualTopup.submitting = false;
            submitButton.innerHTML = '<i data-lucide="circle-check-big"></i> ยืนยันและบันทึกรายการเติมเงิน';
            this.updateManualTopupPreview();
            App.renderIcons();
        }
    },

    // --- TOPUP ---
    async loadTopup() {
        const res = await this.fetchAdmin('/api/admin/topup');
        this.globalData.topups = res.requests;
        const tbody = document.getElementById('topup-tbody');
        tbody.innerHTML = '';
        if (res.requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#94a3b8;">ยังไม่มีรายการเติมเงิน</td></tr>';
            return;
        }

        res.requests.forEach(t => {
            const tr = document.createElement('tr');
            let actions = '-';
            if (t.status === 'pending') {
                actions = `
                    <button class="action-btn btn-approve">Approve</button>
                    <button class="action-btn btn-reject">Reject</button>
                `;
            }

            const source = t.source === 'manual' ? 'manual' : 'slip';
            const sourceHtml = source === 'manual'
                ? '<span style="display:inline-block; padding:4px 9px; border-radius:999px; color:#fcd34d; background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.28); font-weight:700;">MANUAL</span>'
                : '<span style="display:inline-block; padding:4px 9px; border-radius:999px; color:#c084fc; background:rgba(168,85,247,.12); border:1px solid rgba(168,85,247,.28); font-weight:700;">SLIP</span>';

            const transRef = t.trans_ref ? App.escapeHTML(t.trans_ref) : '';
            let referenceHtml = transRef
                ? `<code style="display:block; color:#f8fafc; overflow-wrap:anywhere;">${transRef}</code>`
                : '-';
            const providerReference = String(t.provider_reference || '');
            const safeSlipPath = /^\/?images\/slips\/[A-Za-z0-9._/-]+$/.test(providerReference);
            if (safeSlipPath) {
                referenceHtml = `
                    <a href="${App.escapeHTML(providerReference)}" target="_blank" rel="noopener" class="action-btn" style="background:#6366f1; color:white; padding:6px 10px;"><i data-lucide="image"></i> View Slip</a>
                    ${transRef ? `<small style="display:block; color:#94a3b8; margin-top:6px;">Ref: ${transRef}</small>` : ''}
                `;
            }

            const status = String(t.status || '');
            const statusColor = status === 'approved' ? '#22c55e' : status === 'rejected' ? '#ef4444' : '#f59e0b';
            let reviewerHtml = t.approved_by
                ? `<strong style="color:#f8fafc;">${App.escapeHTML(t.approved_by)}</strong>`
                : (status === 'approved' && source === 'slip' ? '<span style="color:#22c55e;">ระบบอัตโนมัติ</span>' : '-');
            if (t.admin_note) {
                reviewerHtml += `<small style="display:block; max-width:230px; margin-top:5px; color:#94a3b8; white-space:normal; line-height:1.45;">${App.escapeHTML(t.admin_note)}</small>`;
            }

            const createdAt = t.created_at ? new Date(t.created_at).toLocaleString('th-TH') : '-';
            const approvedAt = t.approved_at
                ? `<small style="display:block; color:#94a3b8; margin-top:4px;">อนุมัติ ${new Date(t.approved_at).toLocaleString('th-TH')}</small>`
                : '';

            tr.innerHTML = `
                <td>${t.id}</td>
                <td>${App.escapeHTML(t.username)}</td>
                <td>${sourceHtml}</td>
                <td>${(Number(t.amount_minor) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
                <td>${Number(t.points).toLocaleString('th-TH')}</td>
                <td style="color:${statusColor}; font-weight:700;">${App.escapeHTML(status).toUpperCase()}</td>
                <td>${referenceHtml}</td>
                <td>${reviewerHtml}</td>
                <td>${createdAt}${approvedAt}</td>
                <td>${actions}</td>
            `;
            if (t.status === 'pending') {
                tr.querySelector('.btn-approve').onclick = () => Admin.actionTopup(t.id, 'approve', t.trans_ref || '');
                tr.querySelector('.btn-reject').onclick = () => Admin.actionTopup(t.id, 'reject');
            }
            tbody.appendChild(tr);
        });
        App.renderIcons();
    },

    async actionTopup(id, action, existingReference = '') {
        let requestOptions = { method: 'POST' };

        if (action === 'approve') {
            const approval = await Swal.fire({
                icon: 'question',
                title: 'อนุมัติรายการเติมเงิน',
                html: `
                    <div style="text-align:left;">
                        <label for="approve-topup-reference" style="display:block; margin-bottom:6px; color:#cbd5e1;">เลขอ้างอิงธุรกรรมจากสลิป</label>
                        <input id="approve-topup-reference" class="swal2-input" value="${App.escapeHTML(existingReference)}" minlength="6" maxlength="120" autocomplete="off" placeholder="Transaction Reference" style="width:100%; margin:0 0 14px;">
                        <label for="approve-topup-reason" style="display:block; margin-bottom:6px; color:#cbd5e1;">หมายเหตุการตรวจสอบ</label>
                        <textarea id="approve-topup-reason" class="swal2-textarea" minlength="5" maxlength="500" rows="3" placeholder="เช่น ตรวจสอบชื่อผู้รับ ยอดเงิน และเวลาโอนแล้ว" style="width:100%; margin:0;"></textarea>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'ยืนยันอนุมัติ',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#d4af37',
                background: '#1a1f2b',
                color: '#fff',
                focusConfirm: false,
                preConfirm: () => {
                    const transactionReference = document.getElementById('approve-topup-reference').value.trim();
                    const reason = document.getElementById('approve-topup-reason').value.trim();
                    if (transactionReference.length < 6 || transactionReference.length > 120) {
                        Swal.showValidationMessage(App.translateError('invalid_transaction_reference'));
                        return false;
                    }
                    if (reason.length < 5 || reason.length > 500) {
                        Swal.showValidationMessage(App.translateError('invalid_manual_topup_reason'));
                        return false;
                    }
                    return { transactionReference, reason };
                }
            });
            if (!approval.isConfirmed) return;

            requestOptions = {
                method: 'POST',
                body: JSON.stringify({
                    transaction_reference: approval.value.transactionReference,
                    reason: approval.value.reason
                })
            };
        } else {
            const rejection = await Swal.fire({
                icon: 'warning',
                title: 'ปฏิเสธรายการเติมเงิน?',
                text: 'รายการนี้จะไม่ได้รับพอยท์ และไม่ถูกนับในยอดเติมเงินหน้าเว็บ',
                showCancelButton: true,
                confirmButtonText: 'ยืนยันปฏิเสธ',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#ef4444',
                background: '#1a1f2b',
                color: '#fff'
            });
            if (!rejection.isConfirmed) return;
        }

        await this.fetchAdmin(`/api/admin/topup/${id}/${action}`, requestOptions);
        App.showToast(action === 'approve' ? 'อนุมัติและเติมพอยท์เรียบร้อยแล้ว' : 'ปฏิเสธรายการเรียบร้อยแล้ว');
        await Promise.allSettled([
            this.loadTopup(),
            this.loadWallet(),
            this.loadPlayers()
        ]);

        const profileView = document.getElementById('player-profile-view');
        if (
            action === 'approve' &&
            document.getElementById('players').classList.contains('active') &&
            profileView.style.display === 'block'
        ) {
            const username = document.getElementById('profile-username').innerText.trim();
            if (username) await Promise.allSettled([this.viewPlayerProfile(username)]);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Wait for App to be initialized before Admin init
    setTimeout(() => Admin.init(), 100);
});
