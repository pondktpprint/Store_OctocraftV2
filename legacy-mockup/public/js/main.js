document.addEventListener('DOMContentLoaded', () => {
    initSession();
    initModals();
    checkRouteProtection();
});

function initSession() {
    const userStr = localStorage.getItem('octo_user');
    const token = localStorage.getItem('octo_token');
    
    const profileMenu = document.querySelector('.user-profile-menu');
    
    // หากอยู่ในหน้าเข้าสู่ระบบ (ไม่มี profileMenu) ไม่ต้องจัดการ UI นี้
    if (!profileMenu) return;

    if (token && userStr) {
        // Logged in
        const user = JSON.parse(userStr);
        
        // Build Profile HTML
        let profileHtml = `
            <div class="user-profile-btn" id="user-profile-btn">
                <img src="https://minotar.net/helm/${user.name}/32.png" alt="${user.name}" class="user-avatar" onerror="this.src='/images/logo.png'">
                <div class="user-details">
                    <span class="user-name">${user.name}</span>
                    <span class="user-points" id="nav-points"><i class="fas fa-coins"></i> ${user.points.toLocaleString()} Points</span>
                </div>
                <i class="fas fa-chevron-down dropdown-icon"></i>
            </div>
            
            <div class="profile-dropdown" id="profile-dropdown">
                <a href="#" class="dropdown-item" id="redeem-code-btn"><i class="fas fa-gift"></i> เติมไอเทมโค้ด</a>
        `;
        
        if (user.role === 'admin') {
            profileHtml += `<div class="dropdown-divider"></div>
                            <a href="admin.html" class="dropdown-item"><i class="fas fa-cog"></i> ระบบหลังบ้าน (Admin)</a>`;
        }
        
        profileHtml += `
                <a href="#" class="dropdown-item" onclick="openHistoryModal('topup')"><i class="fas fa-history"></i> ประวัติการเติมเงิน</a>
                <a href="#" class="dropdown-item" onclick="openHistoryModal('purchase')"><i class="fas fa-shopping-bag"></i> ประวัติการซื้อ</a>
                <div class="dropdown-divider"></div>
                <a href="#" class="dropdown-item logout-item" id="nav-logout-btn"><i class="fas fa-sign-out-alt"></i> ออกจากระบบ</a>
            </div>
        `;
        
        profileMenu.innerHTML = profileHtml;
        
        // Add events
        const profileBtn = document.getElementById('user-profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
            profileBtn.querySelector('.dropdown-icon').classList.toggle('active');
        });
        window.addEventListener('click', () => {
            profileDropdown.classList.remove('active');
            const icon = profileBtn.querySelector('.dropdown-icon');
            if(icon) icon.classList.remove('active');
        });
        profileDropdown.addEventListener('click', (e) => e.stopPropagation());
        
        document.getElementById('nav-logout-btn').addEventListener('click', (e) => {
            e.preventDefault();
            const modal = document.getElementById('logout-modal');
            if (modal) modal.classList.add('active');
            else window.logout();
        });

        document.getElementById('redeem-code-btn').addEventListener('click', (e) => {
            e.preventDefault();
            profileDropdown.classList.remove('active');
            const modal = document.getElementById('redeem-modal');
            if (modal) modal.classList.add('active');
            else window.location.href = 'index.html';
        });

    } else {
        // Not logged in
        profileMenu.innerHTML = `<button class="login-btn" id="nav-login-btn"><i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ</button>`;
        document.getElementById('nav-login-btn').addEventListener('click', () => {
            const modal = document.getElementById('login-modal');
            if (modal) modal.classList.add('active');
            else window.location.href = 'index.html';
        });
    }
}

function initModals() {
    // 1. Setup Login Form
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('.submit-login-btn');
            btn.textContent = 'กำลังเข้าสู่ระบบ...';
            btn.disabled = true;
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                
                if (data.ok) {
                    localStorage.setItem('octo_token', data.token);
                    localStorage.setItem('octo_user', JSON.stringify(data.player));
                    window.location.reload();
                } else {
                    alert(data.error || 'เข้าสู่ระบบล้มเหลว');
                }
            } catch (err) {
                alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
            } finally {
                btn.textContent = 'เข้าสู่ระบบ';
                btn.disabled = false;
            }
        });
    }
    
    // 2. Setup Close Buttons for all modals
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal-overlay').classList.remove('active');
        });
    });

    // 3. Setup Confirm Logout
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            localStorage.removeItem('octo_token');
            localStorage.removeItem('octo_user');
            window.location.href = 'index.html';
        });
    }

    // 4. Setup Redeem Form
    const redeemForm = document.getElementById('redeem-form');
    if (redeemForm) {
        redeemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = redeemForm.querySelector('button[type="submit"]');
            btn.textContent = 'กำลังตรวจสอบ...';
            btn.disabled = true;
            
            const code = document.getElementById('redeem-code-input').value;
            const userStr = localStorage.getItem('octo_user');
            if (!userStr) return;
            const username = JSON.parse(userStr).name;

            try {
                const res = await fetch('/api/shop/redeem', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, code })
                });
                const data = await res.json();
                
                if (data.ok) {
                    alert('🎉 เติมโค้ดสำเร็จ! คุณได้รับไอเทมในเกมแล้ว');
                    document.getElementById('redeem-modal').classList.remove('active');
                    redeemForm.reset();
                } else {
                    alert('❌ ข้อผิดพลาด: ' + (data.error || 'ไม่สามารถเติมโค้ดได้'));
                }
            } catch (err) {
                alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
            } finally {
                btn.textContent = 'ยืนยันแลกโค้ด';
                btn.disabled = false;
            }
        });
    }

    // Auto open login modal if ?login=true
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'true' && !localStorage.getItem('octo_token')) {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.classList.add('active');
    }
}

function checkRouteProtection() {
    const path = window.location.pathname;
    const isProtected = path.includes('shop.html') || path.includes('topup.html');
    const token = localStorage.getItem('octo_token');
    
    if (isProtected && !token) {
        window.location.href = 'index.html?login=true';
    }
    
    // Protect Admin
    if (path.includes('admin.html')) {
        const userStr = localStorage.getItem('octo_user');
        if (!userStr || JSON.parse(userStr).role !== 'admin') {
            window.location.href = 'index.html';
        }
    }
}

// อัปเดตพอยท์ใน UI หากมีการเปลี่ยนแปลงจากหน้าอื่น
window.updatePointsUI = function(newPoints) {
    const userStr = localStorage.getItem('octo_user');
    if (userStr) {
        const user = JSON.parse(userStr);
        user.points = newPoints;
        localStorage.setItem('octo_user', JSON.stringify(user));
        
        const navPoints = document.getElementById('nav-points');
        if (navPoints) {
            navPoints.innerHTML = `<i class="fas fa-coins"></i> ${newPoints.toLocaleString()} Points`;
        }
    }
};

// Global Toast Notification System
window.showToast = function(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if(toast.parentElement) toast.remove();
    }, 3000);
};

window.openHistoryModal = async function(type) {
    const userStr = localStorage.getItem('octo_user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    
    document.getElementById('profile-dropdown').classList.remove('active');
    
    const modal = document.getElementById('history-modal');
    if (!modal) {
        window.location.href = 'index.html';
        return;
    }
    
    modal.classList.add('active');
    
    const title = type === 'topup' ? 'ประวัติการเติมเงิน' : 'ประวัติการซื้อไอเทม';
    document.getElementById('history-modal-title').innerHTML = '<i class="fas fa-history"></i> ' + title;
    
    const list = document.getElementById('history-list');
    list.innerHTML = '<li style="text-align:center; padding: 20px;">กำลังโหลด...</li>';
    
    try {
        const res = await fetch('/api/user/history?user=' + user.name);
        const data = await res.json();
        list.innerHTML = '';
        
        if (data.ok) {
            const items = type === 'topup' ? data.topups : data.purchases;
            if (!items || items.length === 0) {
                list.innerHTML = '<li style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่มีข้อมูล</li>';
                return;
            }
            
            // Sort new first
            items.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            items.forEach(item => {
                const li = document.createElement('li');
                li.style.padding = '15px';
                li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                
                const d = new Date(item.date).toLocaleString('th-TH');
                
                if (type === 'topup') {
                    li.innerHTML = `
                        <div>
                            <div style="font-weight: 600; font-size: 1.1rem; color: var(--success);">+ ${item.amount} THB</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${d}</div>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge" style="background: rgba(59,130,246,0.2); color: #60a5fa;">+${item.points} Points</span>
                        </div>
                    `;
                } else {
                    li.innerHTML = `
                        <div>
                            <div style="font-weight: 600; font-size: 1.1rem; color: var(--warning);">${item.item}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${d}</div>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge" style="background: rgba(239,68,68,0.2); color: #f87171;">-${item.price} Points</span>
                        </div>
                    `;
                }
                list.appendChild(li);
            });
        }
    } catch(e) {
        list.innerHTML = '<li style="text-align:center; padding: 20px; color: var(--danger);">เกิดข้อผิดพลาดในการโหลดข้อมูล</li>';
    }
};

