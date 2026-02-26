const supabaseUrl = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.supabaseUrl : 'YOUR_SUPABASE_URL';
const supabaseKey = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.supabaseKey : 'YOUR_SUPABASE_ANON_KEY';
const client = supabase.createClient(supabaseUrl, supabaseKey);
let user = null;
let userProfile = null;
let isPrivacyMode = false;
let maxLoanAmount = 0;
let numLoans = 0;
let profileInsertAttempts = 0;
let allHistoryTransactions = [];
let currentLoanBalance = 0;
const kenyaLocations = {
    "Nairobi": ["Westlands", "Dagoretti", "Langata", "Kibra", "Roysambu", "Kasarani"],
    "Mombasa": ["Changamwe", "Jomvu", "Kisauni", "Nyali", "Likoni", "Mvita"],
    "Kisumu": ["Kisumu East", "Kisumu West", "Kisumu Central", "Seme", "Nyando"],
    "Kiambu": ["Kiambu", "Ruiru", "Thika", "Juja", "Gatundu", "Limuru"],
    "Nakuru": ["Nakuru Town", "Naivasha", "Gilgil", "Molo", "Njoro"],
    "Homa Bay": ["Homa Bay Town", "Kabondo", "Kasipul", "Rangwe", "Mbita"]
};

// 1. INIT
client.auth.onAuthStateChange(async (e, session) => {
    if (session) {
        user = session.user;
        loadData();
    } else {
        window.location.href = 'index.html';
    }
});

// 2. LOAD DATA
async function loadData() {
    // Fetch fresh profile data
    const { data } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();

    if (data) {
        userProfile = data;
        updateUI();
        loadGuarantorRequests();
        loadLoansView();
        setInterval(loadGuarantorRequests, 5000);
        setInterval(refreshBalance, 5000); // Fix: Auto-refresh balance
    } else {
        // If profile missing, create one but avoid infinite reload loops.
        profileInsertAttempts += 1;
        if (profileInsertAttempts > 3) {
            console.error('Failed to create profile after multiple attempts. Check DB triggers or permissions.');
            alert('Could not create profile automatically. Please contact admin.');
            return;
        }

        // Attempt to upsert a minimal profile record using the auth user id.
        // Do NOT provide j_number or member_number here — let the DB trigger/sequence assign them.
        const safeProfile = {
            id: user.id,
            full_name: (user.user_metadata && user.user_metadata.first_name) ? (user.user_metadata.first_name + ' ' + (user.user_metadata.last_name || '')) : 'New Member',
            phone: (user.user_metadata && user.user_metadata.phone) ? user.user_metadata.phone : '',
            email: user.email, // Fix: Ensure email is saved if profile is created via dashboard
            savings_balance: 0,
            country: (user.user_metadata && user.user_metadata.country) ? user.user_metadata.country : 'Kenya',
            county: (user.user_metadata && user.user_metadata.county) ? user.user_metadata.county : null,
            sub_county: (user.user_metadata && user.user_metadata.sub_county) ? user.user_metadata.sub_county : null,
            ward: (user.user_metadata && user.user_metadata.ward) ? user.user_metadata.ward : null
        };

        const { data: upserted, error: upsertErr } = await client.from('profiles').upsert(safeProfile).select();

        if (upsertErr) {
            console.error('Profile upsert error:', upsertErr);
            alert('Error creating profile: ' + upsertErr.message + '. Check server logs.');
            return;
        }

        // Load data again after a short delay to allow DB triggers to populate generated fields
        setTimeout(loadData, 800);
    }
}

// New function to keep balance in sync
async function refreshBalance() {
    const { data } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
        userProfile = data;
        updateUI(); // Updates the HTML elements with new numbers
    }
}

// 3. UPDATE UI
function updateUI() {
    document.getElementById('member-id').innerText = userProfile.member_number || 'Member';
    updateBalance('bal-savings', userProfile.savings_balance || 0);
    updateBalance('bal-shares', userProfile.share_capital || 0);
    updateBalance('loan-limit', (userProfile.savings_balance || 0) * 3);
    updateBalance('locked-guarantees', userProfile.locked_guarantee_amount || 0);
    updateNetSavings();

    // Update Header Info
    const firstName = (userProfile.full_name || userProfile.first_name || 'Member').split(' ')[0];
    const headerNameEl = document.getElementById('header-firstname');
    if (headerNameEl) headerNameEl.innerText = firstName;

    const avatarEl = document.getElementById('header-avatar');
    if (avatarEl) {
        if (userProfile.avatar_url) avatarEl.src = userProfile.avatar_url;
        else avatarEl.src = `https://ui-avatars.com/api/?name=${firstName}&background=random`;
    }
}

function updateBalance(elemId, amount) {
    const elem = document.getElementById(elemId); // This might be multiple elements
    if (isPrivacyMode) {
        elem.classList.add('blur-balance');
    } else {
        elem.classList.remove('blur-balance');
    }
    elem.innerText = amount.toLocaleString();
}

function updateNetSavings() {
    if (!userProfile) return;
    const savings = userProfile.savings_balance || 0;
    const locked = userProfile.locked_guarantee_amount || 0;
    const net = savings - (currentLoanBalance + locked);
    updateBalance('bal-net-savings', net);
}

// 4. PRIVACY MODE
function togglePrivacyMode() {
    const toggle = document.getElementById('privacy-toggle');
    const indicator = document.getElementById('privacy-indicator');

    if (toggle.classList.contains('bg-indigo-600')) { // Is currently on, turn off
        isPrivacyMode = false;
        toggle.classList.remove('bg-indigo-600', 'dark:bg-indigo-500');
        toggle.classList.add('bg-gray-300');
        indicator.classList.remove('translate-x-5');
    } else { // Is currently off, turn on
        isPrivacyMode = true;
        toggle.classList.add('bg-indigo-600', 'dark:bg-indigo-500');
        toggle.classList.remove('bg-gray-300');
        indicator.classList.add('translate-x-5');
    }

    document.querySelectorAll('.balance-amount').forEach(el => {
        el.classList.toggle('blur-balance', isPrivacyMode);
    });
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateDarkModeToggleUI();
}

function updateDarkModeToggleUI() {
    const isDark = document.documentElement.classList.contains('dark');
    const toggle = document.getElementById('dark-mode-toggle');
    const indicator = document.getElementById('dark-mode-indicator');

    if (!toggle || !indicator) return;

    indicator.classList.toggle('translate-x-5', isDark);

    if (isDark) {
        toggle.classList.remove('bg-gray-300');
        toggle.classList.add('bg-indigo-600', 'dark:bg-indigo-500');
    } else {
        toggle.classList.add('bg-gray-300');
        toggle.classList.remove('bg-indigo-600', 'dark:bg-indigo-500');
    }
}

// 5. CARD SCROLL INDICATOR
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.cards-container');
    if (container) {
        container.addEventListener('scroll', () => {
            const scrollLeft = container.scrollLeft;
            const cardWidth = container.querySelector('.card').offsetWidth + 16;
            const activeCard = Math.round(scrollLeft / cardWidth);

            document.querySelectorAll('[id^="dot-"]').forEach((dot, idx) => {
                if (idx === activeCard) {
                    dot.classList.remove('bg-gray-300', 'dark:bg-gray-600');
                    dot.classList.add('bg-indigo-600', 'dark:bg-indigo-400', 'w-6');
                } else {
                    dot.classList.remove('bg-indigo-600', 'dark:bg-indigo-400', 'w-6');
                    dot.classList.add('bg-gray-300', 'dark:bg-gray-600');
                }
            });
        });
    }
});

// 6. MODALS
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function doAction(type) {
    if (type === 'deposit') {
        const phoneInput = document.getElementById('dep-phone');
        if (userProfile && userProfile.phone) {
            let cleanPhone = userProfile.phone.replace(/\D/g, '');
            if (cleanPhone.startsWith('254')) cleanPhone = cleanPhone.substring(3);
            if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
            phoneInput.value = cleanPhone;
        }
        document.getElementById('deposit-modal').classList.remove('hidden');
    }
    else if (type === 'withdraw') {
        document.getElementById('avail-bal').innerText = "KES " + (userProfile.savings_balance || 0).toLocaleString();
        document.getElementById('withdraw-modal').classList.remove('hidden');
    }
    else if (type === 'transfer') {
        document.getElementById('transfer-avail-bal').innerText = "KES " + (userProfile.savings_balance || 0).toLocaleString();
        document.getElementById('transfer-modal').classList.remove('hidden');
    }
    else if (type === 'loan') {
        document.getElementById('loan-modal').classList.remove('hidden');
        checkLoanEligibility();
    }
}

// 7. NAVIGATION
function switchView(view) {
    const dashboardView = document.getElementById('dashboard-view');
    const loansView = document.getElementById('loans-view');
    const guarantorView = document.getElementById('guarantor-view');
    const historyView = document.getElementById('history-view');

    if (dashboardView) dashboardView.classList.toggle('hidden', view !== 'dashboard');
    if (loansView) loansView.classList.toggle('hidden', view !== 'loans');
    if (guarantorView) guarantorView.classList.toggle('hidden', view !== 'guarantor');
    if (historyView) historyView.classList.toggle('hidden', view !== 'history');

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(el => el.classList.remove('active', 'border-t-4', 'border-indigo-600', 'dark:border-indigo-400'));

    const activeNav = Array.from(navItems).find(el => {
        const text = el.querySelector('span')?.innerText.toLowerCase();
        if (view === 'dashboard') return text === 'home';
        if (view === 'loans') return text === 'loans';
        if (view === 'guarantor') return text === 'guarantor';
        if (view === 'history') return text === 'history';
        return false;
    });
    if (activeNav) activeNav.classList.add('active', 'border-t-4', 'border-indigo-600', 'dark:border-indigo-400');

    if (view === 'history') loadAllTransactions();
    if (view === 'loans') loadLoansView();
    if (view === 'guarantor') loadGuarantorView();
}

// 8. RECENT TRANSACTIONS
async function loadAllTransactions() {
    const { data: txs } = await client
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    allHistoryTransactions = txs || [];
    filterHistory();
}

function filterHistory() {
    const search = document.getElementById('history-search').value.toLowerCase();
    const filter = document.getElementById('history-filter').value;
    const container = document.getElementById('history-list');

    let filtered = allHistoryTransactions;

    // Filter by Type
    if (filter !== 'all') {
        filtered = filtered.filter(tx => tx.type === filter);
    }

    // Filter by Search
    if (search) {
        filtered = filtered.filter(tx => {
            const amount = tx.amount.toString();
            const date = new Date(tx.created_at).toLocaleDateString().toLowerCase();
            const status = (tx.status || '').toLowerCase();
            // Map types to readable names for search
            let typeName = '';
            if (tx.type === 'deposit') typeName = 'deposit';
            else if (tx.type === 'withdrawal') typeName = 'withdrawal';
            else if (tx.type === 'loan_disbursement') typeName = 'loan';
            else if (tx.type === 'repayment') typeName = 'repayment';
            else if (tx.type === 'share_transfer') typeName = 'share transfer';

            return amount.includes(search) || date.includes(search) || status.includes(search) || typeName.includes(search);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">No transactions found</div>';
        return;
    }

    container.innerHTML = filtered.map(tx => formatTransaction(tx)).join('');
}

function exportHistoryToCSV() {
    const search = document.getElementById('history-search').value.toLowerCase();
    const filter = document.getElementById('history-filter').value;

    let filtered = allHistoryTransactions;

    // Filter by Type
    if (filter !== 'all') {
        filtered = filtered.filter(tx => tx.type === filter);
    }

    // Filter by Search
    if (search) {
        filtered = filtered.filter(tx => {
            const amount = tx.amount.toString();
            const date = new Date(tx.created_at).toLocaleDateString().toLowerCase();
            const status = (tx.status || '').toLowerCase();
            let typeName = '';
            if (tx.type === 'deposit') typeName = 'deposit';
            else if (tx.type === 'withdrawal') typeName = 'withdrawal';
            else if (tx.type === 'loan_disbursement') typeName = 'loan';
            else if (tx.type === 'repayment') typeName = 'repayment';
            else if (tx.type === 'share_transfer') typeName = 'share transfer';

            return amount.includes(search) || date.includes(search) || status.includes(search) || typeName.includes(search);
        });
    }

    if (filtered.length === 0) {
        alert("No transactions to export");
        return;
    }

    let csvContent = "Date,Type,Amount,Status,Reference\n";
    filtered.forEach(tx => {
        const date = new Date(tx.created_at).toLocaleDateString();
        const status = tx.status || 'completed';
        const ref = tx.mpesa_code || '-';
        csvContent += `${date},${tx.type},${tx.amount},${status},${ref}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "transaction_history.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadShareCertificate() {
    if (!userProfile) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a5'
    });

    // Background & Border
    doc.setLineWidth(2);
    doc.setDrawColor(22, 163, 74); // Green-600
    doc.rect(5, 5, 200, 138);

    doc.setLineWidth(0.5);
    doc.setDrawColor(22, 163, 74);
    doc.rect(8, 8, 194, 132);

    // Load Logo dynamically
    const img = new Image();
    img.src = 'juvinal.png';
    img.onload = function () {
        // Draw the logo in top center
        doc.addImage(img, 'PNG', 95, 12, 18, 18);
        finishPDF();
    };
    img.onerror = function () {
        console.warn('Could not load logo for certificate, generating without it.');
        finishPDF();
    };

    function finishPDF() {
        // Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(22, 163, 74);
        doc.text("JUVINAL PAY SACCO", 105, 36, null, null, "center");

        doc.setFontSize(16);
        doc.setTextColor(60, 60, 60);
        doc.text("SHARE CAPITAL CERTIFICATE", 105, 46, null, null, "center");

        // Content
        doc.setFont("times", "normal");
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);

        doc.text("This is to certify that", 105, 62, null, null, "center");

        doc.setFont("times", "bold");
        doc.setFontSize(18);
        doc.text((userProfile.full_name || "Valued Member").toUpperCase(), 105, 72, null, null, "center");

        doc.setFont("times", "normal");
        doc.setFontSize(12);
        doc.text(`Member No: ${userProfile.member_number || 'PENDING'}`, 105, 82, null, null, "center");
        doc.text(`ID Number: ${userProfile.id_number || 'N/A'}`, 105, 89, null, null, "center");

        doc.text("Is the registered holder of Share Capital to the value of:", 105, 102, null, null, "center");

        doc.setFont("times", "bold");
        doc.setFontSize(22);
        doc.setTextColor(22, 163, 74);
        doc.text(`KES ${(userProfile.share_capital || 0).toLocaleString()}`, 105, 115, null, null, "center");

        // Footer
        doc.setFont("times", "italic");
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text(`Authorized by Sacco Administration on ${new Date().toLocaleDateString()}`, 105, 135, null, null, "center");

        // Save
        doc.save(`Juvinal_Share_Certificate_${userProfile.member_number || 'New'}.pdf`);
    }
}

function formatTransaction(tx) {
    const date = new Date(tx.created_at).toLocaleDateString();
    let badge = '', icon = '', color = '', statusText = '';

    if (tx.type === 'deposit') {
        badge = 'Deposit';
        icon = 'ri-add-circle-line';
        color = 'text-green-600';
        statusText = 'Completed';
    } else if (tx.type === 'withdrawal') {
        const status = tx.status || 'pending';
        badge = status === 'completed' ? 'Disbursed ✅' : status === 'rejected' ? 'Rejected ❌' : '⏳ Pending';
        icon = 'ri-bank-card-line';
        color = 'text-orange-600';
        statusText = status === 'completed' ? 'Processed' : status === 'rejected' ? 'Declined' : 'Awaiting approval';
    } else if (tx.type === 'loan_disbursement') {
        badge = 'Loan';
        icon = 'ri-hand-coin-line';
        color = 'text-indigo-600';
        statusText = 'Disbursed';
    } else if (tx.type === 'repayment') {
        badge = 'Loan Repayment';
        icon = 'ri-loop-left-line';
        color = 'text-blue-600';
        statusText = 'Completed';
    } else if (tx.type === 'share_transfer') {
        badge = 'Shares Bought';
        icon = 'ri-exchange-funds-line';
        color = 'text-purple-600';
        statusText = 'Internal Transfer';
    }

    return `
                <div class="bg-white dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <i class="ri-${icon.replace('ri-', '')} ${color} text-lg"></i>
                        <div>
                            <p class="text-xs font-bold text-gray-900">${badge}</p>
                            <p class="text-[10px] text-gray-500">${date}</p>
                        </div>
                    </div>
                    <span class="text-sm font-bold ${color}">KES ${tx.amount.toLocaleString()}</span>
                </div>
            `;
}

// 9. LOANS VIEW
async function loadLoansView() {
    const { data: loans } = await client
        .from('loans')
        .select('*')
        .eq('borrower_id', user.id)
        .order('created_at', { ascending: false });

    // Fetch repayments to show payment history
    const { data: repayments } = await client
        .from('repayments')
        .select('loan_id, amount, created_at')
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false });

    // Show all loans in loans view
    const container = document.getElementById('loans-list');
    const summaryContainer = document.getElementById('loans-summary-container');

    if (!loans || loans.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-6">No loans yet. Apply for one!</div>';
        if (summaryContainer) summaryContainer.innerHTML = '';
        return;
    }

    let totalOutstanding = 0;
    let activeCount = 0;

    container.innerHTML = loans.map(loan => {
        const principal = parseFloat(loan.amount);
        const accruedInterest = parseFloat(loan.accrued_interest || 0);
        const penalty = parseFloat(loan.penalty_amount || 0);
        const totalDue = principal + accruedInterest + penalty;
        const totalRepaid = parseFloat(loan.total_repaid || 0);
        const balance = totalDue - totalRepaid;

        if (loan.status === 'active') {
            totalOutstanding += Math.max(0, balance);
            activeCount++;
        }

        // Find last payment
        const lastPayment = repayments ? repayments.find(r => r.loan_id === loan.id) : null;
        const lastPayText = lastPayment
            ? `Paid KES ${lastPayment.amount.toLocaleString()} on ${new Date(lastPayment.created_at).toLocaleDateString()}`
            : 'No payments yet';

        // Progress calculation
        const progress = Math.min(100, Math.round((totalRepaid / totalDue) * 100)) || 0;
        const statusColors = {
            'active': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
            'pending': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
            'closed': 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
            'rejected': 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
        };

        return `
                    <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Loan #${loan.id.substring(0, 8)}</p>
                                <p class="text-xs text-gray-400">${new Date(loan.created_at).toLocaleDateString()}</p>
                            </div>
                            <span class="text-[10px] font-bold px-2 py-1 rounded uppercase ${statusColors[loan.status] || 'bg-gray-100'}">
                                ${loan.status}
                            </span>
                        </div>
                        
                        <div class="flex justify-between items-end mb-2">
                            <div>
                                <p class="text-xs text-gray-500 dark:text-gray-400">Outstanding Balance</p>
                                <p class="text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}">KES ${Math.max(0, balance).toLocaleString()}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-gray-500 dark:text-gray-400">Principal</p>
                                <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">KES ${principal.toLocaleString()}</p>
                            </div>
                        </div>

                        ${(accruedInterest > 0 || penalty > 0) ? `
                        <div class="flex justify-between text-[10px] text-gray-500 mb-2 px-1">
                            <span>Interest: KES ${accruedInterest.toLocaleString()}</span>
                            ${penalty > 0 ? `<span class="text-red-400">Penalty: KES ${penalty.toLocaleString()}</span>` : ''}
                        </div>
                        ` : ''}

                        <!-- Progress Bar -->
                        <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mb-3">
                            <div class="bg-${balance > 0 ? 'indigo' : 'green'}-500 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                        </div>
                        
                        <div class="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg mb-3">
                            <span class="flex items-center gap-1"><i class="ri-history-line"></i> ${lastPayText}</span>
                            <span class="font-bold">${progress}% Paid</span>
                        </div>

                        ${loan.status === 'active' ? `
                            <button onclick="openRepaymentModal('${loan.id}', ${principal}, ${accruedInterest}, ${penalty}, ${totalRepaid})" 
                                    class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                <span>Pay Now</span>
                                <i class="ri-arrow-right-line"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
    }).join('');

    // Calculate how much of the outstanding balance is covered by external guarantors
    let totalGuaranteedByOthers = 0;
    const activeLoanIds = loans.filter(l => l.status === 'active').map(l => l.id);

    if (activeLoanIds.length > 0) {
        const { data: guarantees } = await client
            .from('guarantees')
            .select('amount')
            .in('loan_id', activeLoanIds)
            .eq('status', 'locked');

        if (guarantees) {
            totalGuaranteedByOthers = guarantees.reduce((sum, g) => sum + parseFloat(g.amount), 0);
        }
    }

    // The user's required collateral for their own loans is isolated
    currentLoanBalance = Math.max(0, totalOutstanding - totalGuaranteedByOthers);
    updateNetSavings();

    // Render Summary Card
    if (summaryContainer) {
        summaryContainer.innerHTML = `
                    <div class="bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
                        <div class="relative z-10">
                            <p class="text-red-100 text-xs font-bold uppercase tracking-wider mb-1">Total Unpaid Loans</p>
                            <h2 class="text-3xl font-extrabold">KES ${totalOutstanding.toLocaleString()}</h2>
                            <p class="text-xs text-red-100 mt-2 opacity-80">${activeCount} active loan(s)</p>
                        </div>
                        <div class="absolute -right-4 -bottom-4 opacity-20 transform rotate-12">
                            <i class="ri-hand-coin-fill text-9xl"></i>
                        </div>
                    </div>
                `;
    }
}

// === LOAN REPAYMENT FUNCTIONS ===
async function openRepaymentModal(loanId, principal, accruedInterest, penalty, totalRepaid) {
    const principal_amt = parseFloat(principal);
    const interest = parseFloat(accruedInterest) || 0;
    const pen = parseFloat(penalty) || 0;
    const totalDue = principal_amt + interest + pen;
    const balance = totalDue - parseFloat(totalRepaid || 0);

    document.getElementById('rep-loan-principal').innerText = `KES ${principal_amt.toLocaleString()}`;
    document.getElementById('rep-loan-interest').innerText = `KES ${(interest + pen).toLocaleString()}`; // Combine interest and penalty for UI simplicity if preferred, or add a span.
    document.getElementById('rep-loan-total').innerText = `KES ${totalDue.toLocaleString()}`;
    document.getElementById('rep-loan-balance').innerText = `KES ${Math.max(0, balance).toLocaleString()}`;
    document.getElementById('max-repayment').innerText = `KES ${Math.max(0, balance).toLocaleString()}`;
    document.getElementById('repayment-amount').max = Math.max(0, balance);
    document.getElementById('repayment-amount').value = '';

    // Reset method to M-Pesa
    const radios = document.getElementsByName('repay-method');
    if (radios.length > 0) radios[0].checked = true;
    updateRepayBtn('mpesa');

    // Store loan ID for submission (phone comes from userProfile)
    document.getElementById('repayment-modal').setAttribute('data-loan-id', loanId);

    document.getElementById('repayment-modal').classList.remove('hidden');
}

function updateRepayBtn(method) {
    const btn = document.getElementById('repayment-btn');
    if (method === 'mpesa') {
        btn.innerHTML = `<span>Send STK Push</span><i class="ri-arrow-right-line"></i>`;
        btn.className = "w-full bg-green-600 hover:bg-green-700 active:scale-95 text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2";
    } else {
        btn.innerHTML = `<span>Pay from Savings</span><i class="ri-wallet-3-line"></i>`;
        btn.className = "w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2";
    }
}

async function submitRepayment(evt) {
    const modal = document.getElementById('repayment-modal');
    const loanId = modal.getAttribute('data-loan-id');
    const amount = parseFloat(document.getElementById('repayment-amount').value);
    const phone = userProfile?.phone; // Get from logged-in user profile
    const method = document.querySelector('input[name="repay-method"]:checked').value;

    if (!amount || amount < 10) {
        alert('Repayment must be at least KES 10');
        return;
    }

    if (method === 'savings') {
        const savings = userProfile.savings_balance || 0;
        if (amount > savings) {
            alert(`Insufficient savings! You have KES ${savings.toLocaleString()} but are trying to pay KES ${amount.toLocaleString()}`);
            return;
        }
    }

    if (!phone) {
        alert('Please update your phone number in profile settings');
        return;
    }

    const btn = evt.target;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        console.log(`Creating repayment: Loan=${loanId}, Amount=${amount}, Method=${method}`);

        // 1. Create repayment record in database
        const { data: repayment, error: repayErr } = await client.from('repayments').insert({
            loan_id: loanId,
            user_id: user.id,
            amount: amount,
            phone: phone,
            status: 'pending',
            payment_method: method
        }).select();

        if (repayErr) throw new Error('Failed to create repayment: ' + repayErr.message);

        console.log('✅ Repayment record created:', repayment[0].id);

        if (method === 'mpesa') {
            // 2A. Send STK push via edge function
            console.log('📱 Sending STK push to', phone);
            const { data: { session } } = await client.auth.getSession();

            const queryParams = new URLSearchParams({
                phone: phone,
                amount: amount.toString(),
                repaymentId: repayment[0].id // Link STK push to this repayment
            });

            const stkResponse = await fetch(
                'https://ckcxwsorhuauxijxzihv.supabase.co/functions/v1/mpesa-push?' + queryParams,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + session.access_token
                    }
                }
            );

            const stkData = await stkResponse.json();
            if (!stkResponse.ok) throw new Error('STK push failed: ' + (stkData.error || 'Unknown error'));

            console.log('✅ STK push sent successfully:', stkData);
            alert('✅ STK Push sent! Check your phone for M-Pesa prompt.');
        } else {
            // 2B. Process Savings Payment via Edge Function
            console.log('💰 Processing savings payment...');
            const { data: { session } } = await client.auth.getSession();

            const res = await fetch('https://ckcxwsorhuauxijxzihv.supabase.co/functions/v1/mpesa-disburse', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token
                },
                body: JSON.stringify({
                    repaymentId: repayment[0].id,
                    userId: user.id,
                    amount: amount
                })
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            alert('✅ Payment successful! Loan balance updated.');
        }

        closeModal('repayment-modal');

        // Reload loans after brief delay to show updated balance
        setTimeout(() => {
            loadLoansView();
            loadData();
        }, 2000);

    } catch (err) {
        console.error('Repayment error:', err);
        document.getElementById('repayment-msg').innerText = 'Error: ' + err.message;
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        updateRepayBtn(method);
    }
}

// 10. GUARANTOR VIEW
async function loadGuarantorView() {
    const { data: requests } = await client
        .from('guarantor_requests')
        .select('*, loans(amount), profiles(full_name)')
        .eq('guarantor_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    const container = document.getElementById('guarantor-list');
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-6">No requests</div>';
        return;
    }

    container.innerHTML = requests.map(req => `
                <div class="bg-white p-4 rounded-xl border border-yellow-200">
                    <p class="text-xs font-bold text-gray-700 mb-2">${req.profiles?.full_name || 'Member'}</p>
                    <p class="text-sm font-bold text-gray-900 mb-3">KES ${req.amount_guaranteed.toLocaleString()}</p>
                    <div class="flex gap-2">
                        <button onclick="acceptGuarantee('${req.id}', ${req.amount_guaranteed})" class="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-green-700 transition-colors">Accept</button>
                        <button onclick="declineGuarantee('${req.id}')" class="flex-1 bg-red-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-700 transition-colors">Decline</button>
                    </div>
                </div>
            `).join('');
}

// 11. GUARANTOR FUNCTIONS
async function loadGuarantorRequests() {
    const { data: requests } = await client
        .from('guarantor_requests')
        .select('*')
        .eq('guarantor_id', user.id)
        .eq('status', 'pending');

    const badge = document.getElementById('notif-badge');
    if (requests && requests.length > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    const container = document.getElementById('notifications-list');
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-6">No guarantor requests</div>';
        return;
    }

    container.innerHTML = requests.map(req => `
                <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-yellow-200 dark:border-yellow-700">
                    <p class="text-sm font-bold text-gray-900 mb-3">KES ${req.amount_guaranteed.toLocaleString()}</p>
                    <div class="flex gap-2">
                        <button onclick="acceptGuarantee('${req.id}', ${req.amount_guaranteed})" class="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-lg">Accept</button>
                        <button onclick="declineGuarantee('${req.id}')" class="flex-1 bg-red-600 text-white text-xs font-bold py-2 rounded-lg">Decline</button>
                    </div>
                </div>
            `).join('');
}

async function acceptGuarantee(requestId, amount) {
    try {
        const { data: request } = await client
            .from('guarantor_requests')
            .select('loan_id, guarantor_id')
            .eq('id', requestId)
            .single();

        await client.from('guarantor_requests').update({ status: 'accepted' }).eq('id', requestId);
        await client.from('guarantees').insert({
            loan_id: request.loan_id,
            guarantor_id: request.guarantor_id,
            amount: amount,
            status: 'locked'
        });

        const { data: guarantor } = await client.from('profiles').select('locked_guarantee_amount').eq('id', request.guarantor_id).single();
        const newLocked = (guarantor?.locked_guarantee_amount || 0) + amount;
        await client.from('profiles').update({ locked_guarantee_amount: newLocked }).eq('id', request.guarantor_id);

        alert('✅ Guarantee accepted!');
        loadGuarantorRequests();
        updateUI();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function declineGuarantee(requestId) {
    if (!confirm('Decline this guarantee?')) return;
    try {
        await client.from('guarantor_requests').update({ status: 'declined' }).eq('id', requestId);
        alert('❌ Declined');
        loadGuarantorRequests();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// 12. LOAN ELIGIBILITY
function checkGuarantorRequirement() {
    const amount = parseFloat(document.getElementById('loan-amount').value) || 0;
    const savings = userProfile.savings_balance || 0;
    const section = document.getElementById('guarantor-section');
    if (amount > savings && amount > 0) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
        clearGuarantorSelection();
    }
}

async function checkLoanEligibility() {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const { data: deposits } = await client
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('type', 'deposit')
            .gt('created_at', sixMonthsAgo.toISOString());

        // FIX: Count ALL loans (Active + Closed) to determine tier (1st, 2nd, 3rd)
        const { data: allLoans } = await client
            .from('loans')
            .select('id, status')
            .eq('borrower_id', user.id)
            .neq('status', 'rejected'); // Exclude rejected applications

        const monthCount = deposits ? new Set(deposits.map(d => new Date(d.created_at).toLocaleString('en-US', { month: 'numeric', year: 'numeric' }))).size : 0;
        const avgMonthly = deposits ? deposits.reduce((sum, d) => sum + d.amount, 0) / Math.max(monthCount, 1) : 0;

        // Tier is based on how many loans you have EVER taken (plus this new one)
        const historicalLoanCount = allLoans ? allLoans.length : 0;
        const nextLoanTier = historicalLoanCount + 1; // 1st, 2nd, 3rd...

        const savings = userProfile.savings_balance || 0;

        let maxLoan = 0;
        let canApply = false;
        let eligibilityMessage = '';

        const hasActiveOrPending = allLoans ? allLoans.some(l => l.status === 'active' || l.status === 'pending') : false;

        if (hasActiveOrPending) {
            eligibilityMessage = `<p class="text-red-600"><i class="ri-close-circle-line"></i> You already have an active or pending loan.</p>`;
        } else if (monthCount < 6) {
            eligibilityMessage = `<p class="text-red-600"><i class="ri-close-circle-line"></i> ${6 - monthCount} more months to go</p>`;
        } else if (avgMonthly < 500) {
            eligibilityMessage = `<p class="text-red-600"><i class="ri-close-circle-line"></i> Monthly avg KES ${Math.round(avgMonthly)}</p>`;
        } else {
            canApply = true;
            // Logic: 1st Loan = 1x, 2nd Loan = 2x, 3rd Loan = 3x
            // Cap at 3x for any loan after the 3rd
            const multiplier = Math.min(3, nextLoanTier);
            maxLoan = savings * multiplier;
            maxLoanAmount = maxLoan;
            eligibilityMessage = `
                        <p class="text-green-600"><i class="ri-check-circle-line"></i> ✅ Eligible!</p>
                        <p class="text-xs text-gray-600 mt-2">Loan Tier: ${nextLoanTier} (${multiplier}x Savings) | Max: KES ${maxLoan.toLocaleString()}</p>
                    `;
        }

        document.getElementById('eligibility-content').innerHTML = eligibilityMessage;

        if (canApply) {
            document.getElementById('loan-form').classList.remove('hidden');
            document.getElementById('loan-btn').classList.remove('hidden');
            document.getElementById('max-loan').innerText = "KES " + maxLoan.toLocaleString();
        }
    } catch (err) {
        document.getElementById('eligibility-content').innerHTML = `<p class="text-red-600">Error:</p>`;
    }
}

// === WITHDRAWAL & TRANSFER ===
function openWithdrawModal() {
    document.getElementById('withdraw-modal').classList.remove('hidden');
    const savings = parseFloat(userProfile?.savings_balance || 0);
    const locked = parseFloat(userProfile?.locked_guarantee_amount || 0);
    const loans = parseFloat(currentLoanBalance || 0); // Active loan deductor
    const net = Math.max(0, savings - (locked + loans));

    document.getElementById('wd-max').innerText = `Max: KES ${net.toLocaleString()}`;
    document.getElementById('wd-amount').max = net;
    document.getElementById('wd-btn').disabled = false;
    document.getElementById('wd-msg').innerText = '';
}

function openLoanReview() {
    const amount = parseFloat(document.getElementById('loan-amount').value);
    const disburseMethod = document.querySelector('input[name="disburse"]:checked').value;

    if (!amount || amount < 100) {
        alert('Loan must be KES 100+');
        return;
    }

    const savings = userProfile.savings_balance || 0;
    const totalGuaranteed = selectedGuarantors.reduce((sum, g) => sum + g.amount, 0);
    const totalCovered = savings + totalGuaranteed;

    if (amount > totalCovered) {
        const deficit = amount - totalCovered;
        alert(`⚠️ Insufficient Coverage!\n\nLoan Amount: KES ${amount.toLocaleString()}\nYour Savings: KES ${savings.toLocaleString()}\nGuarantees: KES ${totalGuaranteed.toLocaleString()}\n\nDeficit: KES ${deficit.toLocaleString()}\n\nPlease add more guarantors.`);
        return;
    }

    // Calculations
    const processingFee = 100;
    const insuranceCharge = amount * 0.003;
    const takeHome = amount - processingFee - insuranceCharge;

    // Populate Modal
    document.getElementById('review-repayment-name').innerText = disburseMethod === 'mpesa' ? 'M-PESA WALLET' : 'SACCO SAVINGS';
    document.getElementById('review-repayment-number').innerText = disburseMethod === 'mpesa' ? (userProfile.phone || 'Unknown') : 'Internal Transfer';
    document.getElementById('review-loan-amount').innerText = `KES ${amount.toLocaleString()}`;
    document.getElementById('review-take-home').innerText = `KES ${takeHome.toLocaleString()}`;
    document.getElementById('review-processing-fee').innerText = `KES ${processingFee.toLocaleString()}`;
    document.getElementById('review-insurance').innerText = `KES ${insuranceCharge.toLocaleString()}`;

    // Switch modals
    closeModal('loan-modal');
    document.getElementById('loan-review-modal').classList.remove('hidden');
}

async function submitLoanRequest() {
    const amount = parseFloat(document.getElementById('loan-amount').value);
    const disburseMethod = document.querySelector('input[name="disburse"]:checked').value;

    const processingFee = 100;
    const insuranceCharge = amount * 0.003;
    const takeHome = amount - processingFee - insuranceCharge;

    const btn = document.getElementById('review-submit-btn');
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin"></i> Processing...`;
    btn.disabled = true;

    try {
        // Insert Loan with new columns
        const { data: loan, error: loanErr } = await client.from('loans').insert({
            borrower_id: user.id,
            amount: amount,
            processing_fee: processingFee,
            insurance_charge: insuranceCharge,
            take_home_amount: takeHome,
            guarantor_id: null,
            status: 'pending',
            disbursement_method: disburseMethod
        }).select();

        if (loanErr) throw loanErr;

        // Insert Guarantor Requests
        if (selectedGuarantors.length > 0 && loan) {
            const requests = selectedGuarantors.map(g => ({
                loan_id: loan[0].id,
                borrower_id: user.id,
                guarantor_id: g.id,
                amount_guaranteed: g.amount,
                status: 'pending'
            }));

            const { error: guarantorError } = await client.from('guarantor_requests').insert(requests);
            if (guarantorError) throw guarantorError;
        }

        alert('✅ Loan request submitted successfully!');
        closeModal('loan-review-modal');
        setTimeout(() => location.reload(), 1000);
    } catch (err) {
        alert('Error: ' + err.message);
        btn.innerHTML = `<span>Accept & Submit</span>`;
        btn.disabled = false;
    }
}

async function searchGuarantorMembers() {
    const query = document.getElementById('guarantor-search').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('guarantor-search-results');

    if (query.length < 1) {
        resultsContainer.classList.add('hidden');
        return;
    }

    try {
        const { data: members } = await client
            .from('profiles')
            // FIX: Include id_number in fetch
            .select('id, full_name, member_number, id_number, savings_balance, locked_guarantee_amount')
            .neq('id', user.id);

        // Filter out already selected guarantors
        const availableMembers = members.filter(m => !selectedGuarantors.some(g => g.id === m.id));

        const filtered = members.filter(m =>
            (m.full_name && m.full_name.toLowerCase().includes(query)) ||
            (m.member_number && m.member_number.toLowerCase().includes(query)) ||
            (m.id_number && m.id_number.toLowerCase().includes(query)) // FIX: Search by ID Number
        );

        if (filtered.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-red-500">No members found</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = filtered.map(m => `
                    <button type="button" onclick="selectGuarantor('${m.id}', '${m.full_name}', ${m.savings_balance || 0}, ${m.locked_guarantee_amount || 0})" 
                            class="w-full text-left p-2 bg-white border border-yellow-200 rounded hover:bg-yellow-50">
                        <p class="text-xs font-bold text-gray-900">${m.full_name}</p>
                        <div class="flex justify-between text-[10px] text-gray-500">
                            <span>ID: ${m.id_number || 'N/A'}</span>
                            <span class="font-bold text-green-600">Free: KES ${Math.max(0, (m.savings_balance || 0) - (m.locked_guarantee_amount || 0)).toLocaleString()}</span>
                        </div>
                    </button>
                `).join('');

        resultsContainer.classList.remove('hidden');
    } catch (err) {
        resultsContainer.innerHTML = '<div class="text-xs text-red-500">Search error</div>';
    }
}

async function selectGuarantor(memberId, memberName, savings, locked) {
    const available = Math.max(0, savings - locked);

    if (available <= 0) {
        alert(`${memberName} has no available savings to guarantee this loan.`);
        return;
    }

    const amountStr = prompt(`Enter guarantee amount for ${memberName}\n(Max Available: KES ${available.toLocaleString()})`);
    if (!amountStr) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        alert("Invalid amount");
        return;
    }
    if (amount > available) {
        alert(`Amount exceeds guarantor's available savings (KES ${available.toLocaleString()})`);
        return;
    }

    selectedGuarantors.push({ id: memberId, name: memberName, amount: amount });
    updateGuarantorList();

    document.getElementById('guarantor-search-results').classList.add('hidden');
    document.getElementById('guarantor-search').value = '';
}

function updateGuarantorList() {
    const container = document.getElementById('selected-guarantors-list');
    if (selectedGuarantors.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = selectedGuarantors.map((g, index) => `
                <div class="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded border border-green-200 dark:border-green-700">
                    <div>
                        <p class="text-xs font-bold text-gray-800">${g.name}</p>
                        <p class="text-[10px] text-gray-500">Guarantees: KES ${g.amount.toLocaleString()}</p>
                    </div>
                    <button onclick="removeGuarantor(${index})" class="text-red-500 hover:text-red-700"><i class="ri-close-circle-line text-lg"></i></button>
                </div>
            `).join('');
}

function removeGuarantor(index) {
    selectedGuarantors.splice(index, 1);
    updateGuarantorList();
}

function clearGuarantorSelection() {
    selectedGuarantors = [];
    updateGuarantorList();
}

// 13. DEPOSIT/WITHDRAW (Keep original implementation)
async function executeDeposit() {
    const amount = document.getElementById('dep-amount').value;
    let phone = document.getElementById('dep-phone').value;
    const btn = document.getElementById('dep-btn');
    const msg = document.getElementById('dep-msg');

    if (!amount || amount < 10) {
        msg.innerText = "Minimum KES 10";
        msg.className = "text-center text-[10px] font-bold mt-4 text-red-500";
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin"></i> Processing...`;

    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = phone.substring(1);
    if (!phone.startsWith('254')) phone = '254' + phone;

    if (userProfile.phone !== phone) {
        await client.from('profiles').update({ phone: phone }).eq('id', user.id);
        userProfile.phone = phone;
    }

    if (!user || !user.id) {
        alert("User session invalid. Please log in again.");
        return;
    }

    try {
        const res = await fetch(`https://ckcxwsorhuauxijxzihv.supabase.co/functions/v1/mpesa-push?phone=${phone}&amount=${amount}&userId=${user.id}`, {
            headers: { 'Authorization': 'Bearer ' + supabaseKey }
        });
        const data = await res.json();

        if (data.ResponseCode === "0") {
            msg.innerText = "CHECK YOUR PHONE!";
            msg.className = "text-center text-[10px] font-bold mt-4 text-blue-600 animate-pulse";

            // Use the specific Transaction ID returned from backend
            const txId = data.db_transaction?.id;
            let attempts = 0;

            const interval = setInterval(async () => {
                attempts++;

                // Poll for THIS specific transaction to be COMPLETED
                const { data: tx } = await client.from('transactions')
                    .select('status')
                    .eq('id', txId)
                    .single();

                // Only show success if status is COMPLETED
                if (tx && tx.status === 'completed') {
                    clearInterval(interval);
                    msg.innerText = "SUCCESS!";
                    msg.className = "text-center text-[10px] font-bold mt-4 text-green-600";
                    setTimeout(() => location.reload(), 1500);
                }

                if (attempts > 30) {
                    clearInterval(interval);
                    btn.disabled = false;
                    btn.innerHTML = "Retry";
                    msg.innerText = "Timeout";
                    msg.className = "text-center text-[10px] font-bold mt-4 text-orange-500";
                }
            }, 2000);
        }
    } catch (e) {
        btn.disabled = false;
        btn.innerHTML = "Pay Now";
        msg.innerText = "Error: Check connection";
        msg.className = "text-center text-[10px] font-bold mt-4 text-red-500";
    }
}

async function executeWithdraw() {
    const amount = document.getElementById('wd-amount').value;
    const btn = document.getElementById('wd-btn');
    const msg = document.getElementById('wd-msg');

    const currentBalance = parseFloat(userProfile.savings_balance || 0);
    const lockedAmount = parseFloat(userProfile.locked_guarantee_amount || 0);
    const activeLoans = parseFloat(currentLoanBalance || 0);
    const availableBalance = Math.max(0, currentBalance - (lockedAmount + activeLoans));

    if (!amount || amount < 10 || parseFloat(amount) > availableBalance) {
        msg.innerText = parseFloat(amount) > availableBalance
            ? `Available: KES ${availableBalance.toLocaleString()} (Locked: ${lockedAmount.toLocaleString()}, Loans: ${activeLoans.toLocaleString()})`
            : "Invalid amount (Min KES 10)";
        msg.className = "text-center text-[10px] font-bold mt-4 text-red-500";
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin"></i> Processing...`;

    try {
        await client.from('transactions').insert({
            user_id: user.id,
            type: 'withdrawal',
            amount: parseFloat(amount),
            mpesa_code: 'PENDING',
            status: 'pending'
        });

        msg.innerText = "REQUEST SENT!";
        msg.className = "text-center text-[10px] font-bold mt-4 text-green-600";
        btn.innerHTML = `<i class="ri-check-line"></i> Done`;

        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        btn.disabled = false;
        btn.innerHTML = "Confirm Withdrawal";
        msg.innerText = "Error: " + e.message;
        msg.className = "text-center text-[10px] font-bold mt-4 text-red-500";
    }
}

async function executeTransfer() {
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const btn = document.getElementById('transfer-btn');

    if (!amount || amount < 1) {
        alert("Invalid amount");
        return;
    }

    if (!confirm(`Transfer KES ${amount.toLocaleString()} from Savings to Share Capital?\n\nNOTE: Share Capital cannot be withdrawn.`)) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin"></i> Processing...`;

    try {
        const { data, error } = await client.rpc('transfer_savings_to_shares', { amount: amount });

        if (error) throw error;
        if (!data.success) throw new Error(data.message);

        alert('✅ Transfer Successful! Share Capital updated.');
        location.reload();
    } catch (e) {
        alert("Transfer Failed: " + e.message);
        btn.disabled = false;
        btn.innerHTML = `<span>Confirm Transfer</span><i class="ri-check-line"></i>`;
    }
}

// 14. UI HELPERS
function toggleNotifications() {
    document.getElementById('notifications-modal').classList.toggle('hidden');
}

function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');

    // Populate Member Details
    if (userProfile) {
        // 1. Full Name
        document.getElementById('settings-full-name').innerText = userProfile.full_name || userProfile.first_name || 'Member';
        document.getElementById('settings-member-id').innerText = userProfile.member_number || 'ID: Pending';

        // 2. Avatar
        if (userProfile.avatar_url) {
            document.getElementById('settings-avatar-img').src = userProfile.avatar_url;
        }

        // 3. Joined Date
        const joinedDate = new Date(userProfile.created_at || user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('settings-joined-date').innerText = joinedDate;

        // 4. Email
        document.getElementById('settings-email-text').innerText = user.email || 'No email';

        // 5. Phone
        document.getElementById('settings-phone-text').innerText = userProfile.phone || 'No phone number';

        // 6. National ID
        document.getElementById('settings-id-number').innerText = userProfile.id_number || 'Not set';

        // 6. Location (County)
        // Try to get county from profile or metadata
        const county = userProfile.county || (user.user_metadata && user.user_metadata.county) || 'Unknown';
        const country = userProfile.country || (user.user_metadata && user.user_metadata.country) || 'Kenya';
        document.getElementById('settings-location-text').innerText = county + ', ' + country;
    }

    loadUserDocuments();
    updateDarkModeToggleUI();

    // Populate county dropdown if not already populated
    const countySelect = document.getElementById('edit-county');
    if (countySelect.options.length <= 1) { // Populate only once
        Object.keys(kenyaLocations).forEach(c => {
            let option = document.createElement("option");
            option.text = c;
            option.value = c;
            countySelect.add(option);
        });
    }

    toggleProfileEdit(false); // Ensure it starts in view mode
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

// === DOCUMENT MANAGEMENT ===
function toggleProfileEdit(isEditing) {
    // Toggle visibility of view/edit elements
    document.getElementById('settings-phone-text').classList.toggle('hidden', isEditing);
    document.getElementById('edit-phone').classList.toggle('hidden', !isEditing);

    document.getElementById('settings-location-text').classList.toggle('hidden', isEditing);
    document.getElementById('edit-county').classList.toggle('hidden', !isEditing);

    document.getElementById('edit-profile-btn').classList.toggle('hidden', isEditing);
    document.getElementById('edit-profile-actions').classList.toggle('hidden', !isEditing);

    if (isEditing) {
        // Populate inputs with current data
        document.getElementById('edit-phone').value = userProfile.phone || '';
        document.getElementById('edit-county').value = userProfile.county || '';
    }
}

async function saveProfileChanges() {
    const newPhone = document.getElementById('edit-phone').value.trim();
    const newCounty = document.getElementById('edit-county').value;

    const updates = {};
    if (newPhone !== (userProfile.phone || '')) {
        updates.phone = newPhone;
    }
    if (newCounty !== (userProfile.county || '')) {
        updates.county = newCounty;
    }

    if (Object.keys(updates).length === 0) {
        toggleProfileEdit(false); // No changes, just exit edit mode
        return;
    }

    try {
        const { error } = await client.from('profiles').update(updates).eq('id', user.id);
        if (error) throw error;

        alert('✅ Profile updated successfully!');

        Object.assign(userProfile, updates);
        openSettings(); // Re-populate the settings view with new data

    } catch (err) {
        alert('Error updating profile: ' + err.message);
    }
}

async function loadUserDocuments() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    try {
        const { data: docs } = await client.from('documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        const container = document.getElementById('user-docs-list');

        if (!docs || docs.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400">No documents uploaded yet</p>';
            return;
        }

        container.innerHTML = docs.map(doc => {
            const isImage = doc.url && (doc.url.includes('.jpg') || doc.url.includes('.png') || doc.url.includes('.jpeg'));
            const verified = doc.verified ? '✅ Verified' : '⏳ Pending';
            return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <div class="flex-1 min-w-0">
                                <p class="text-xs font-bold text-gray-900 truncate">${doc.type}</p>
                                <p class="text-[10px] text-gray-500">${new Date(doc.created_at).toLocaleDateString()} • ${verified}</p>
                            </div>
                            <div class="flex items-center gap-2 ml-2">
                                <a href="${doc.url}" target="_blank" class="text-[10px] text-indigo-600 hover:underline">View</a>
                                <button onclick="deleteDocument('${doc.id}')" class="text-[10px] text-red-600 hover:underline">Delete</button>
                            </div>
                        </div>
                    `;
        }).join('');
    } catch (e) {
        console.error('Load documents error:', e);
    }
}

async function uploadDocument(evt) {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
        alert('Please log in first');
        return;
    }

    const fileInput = document.getElementById('doc-file-input');
    const docType = document.getElementById('doc-upload-type').value;
    const file = fileInput.files?.[0];

    if (!file) {
        alert('Please select a file');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('File must be smaller than 5MB');
        return;
    }

    const btn = evt?.target || document.querySelector('[onclick*="uploadDocument"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Uploading...';
    }

    try {
        // Upload to storage
        const path = `${user.id}/${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadErr } = await client.storage.from('id-docs').upload(path, file, { cacheControl: '3600', upsert: false });

        if (uploadErr) {
            throw new Error('Upload failed: ' + uploadErr.message);
        }

        // Get public URL
        const { data: publicData } = await client.storage.from('id-docs').getPublicUrl(path);
        const publicUrl = publicData?.publicUrl || null;

        // Insert document record
        const { error: docErr } = await client.from('documents').insert({
            user_id: user.id,
            type: docType,
            file_name: file.name,
            url: publicUrl,
            storage_path: path
        });

        if (docErr) {
            throw new Error('Failed to save document: ' + docErr.message);
        }

        alert('✅ Document uploaded successfully!');
        fileInput.value = '';
        loadUserDocuments();
    } catch (e) {
        alert('Error uploading document: ' + e.message);
        console.error('Upload error:', e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Upload Document';
        }
    }
}

// === AVATAR UPLOAD ===
async function uploadAvatar(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert('Image must be smaller than 2MB');
        return;
    }

    // Show loading state on image
    const img = document.getElementById('settings-avatar-img');
    const originalSrc = img.src;
    img.style.opacity = '0.5';

    try {
        const fileExt = file.name.split('.').pop();
        const path = `avatars/${user.id}_${Date.now()}.${fileExt}`;
        // Upload to 'id-docs' bucket but in 'avatars' folder
        const { error: uploadErr } = await client.storage.from('id-docs').upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = client.storage.from('id-docs').getPublicUrl(path);

        // Update profile
        const { error: updateErr } = await client.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
        if (updateErr) throw updateErr;

        // Update UI
        img.src = publicUrl;
        const headerAvatar = document.getElementById('header-avatar');
        if (headerAvatar) headerAvatar.src = publicUrl;
        userProfile.avatar_url = publicUrl; // Update local cache
        alert('✅ Profile photo updated!');
    } catch (e) {
        console.error(e);
        alert('Error updating photo: ' + e.message);
        img.src = originalSrc;
    } finally {
        img.style.opacity = '1';
    }
}

async function handleChangePassword(event) {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    const msgEl = document.getElementById('password-change-msg');
    const btn = event.target;

    // 1. Validation
    if (!newPassword || newPassword.length < 6) {
        msgEl.innerText = 'Password must be at least 6 characters.';
        msgEl.className = 'text-center text-xs font-medium h-4 text-red-500';
        return;
    }
    if (newPassword !== confirmPassword) {
        msgEl.innerText = 'Passwords do not match.';
        msgEl.className = 'text-center text-xs font-medium h-4 text-red-500';
        return;
    }

    msgEl.innerText = 'Updating...';
    msgEl.className = 'text-center text-xs font-medium h-4 text-gray-500';
    btn.disabled = true;
    btn.textContent = 'Updating...';

    // 2. Call Supabase auth update
    const { error } = await client.auth.updateUser({ password: newPassword });

    if (error) {
        msgEl.innerText = 'Error: ' + error.message;
        msgEl.className = 'text-center text-xs font-medium h-4 text-red-500';
    } else {
        msgEl.innerText = '✅ Password updated successfully!';
        msgEl.className = 'text-center text-xs font-medium h-4 text-green-600';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
    }
    btn.disabled = false;
    btn.textContent = 'Update Password';
}

async function deleteDocument(docId) {
    if (!confirm('Delete this document?')) return;

    try {
        // Get document to find file path
        const { data: doc } = await client.from('documents').select('storage_path').eq('id', docId).single();

        if (doc?.storage_path) {
            // Delete from storage
            await client.storage.from('id-docs').remove([doc.storage_path]);
        }

        // Delete record from DB
        await client.from('documents').delete().eq('id', docId);

        alert('Document deleted');
        loadUserDocuments();
    } catch (e) {
        alert('Error deleting document: ' + e.message);
    }
}

function toggleBalanceVisibility() {
    togglePrivacyMode();
}

function openRecentTransactions() {
    document.getElementById('recent-modal').classList.remove('hidden');
    loadAllTransactions();
}

function closeRecentTransactions() {
    document.getElementById('recent-modal').classList.add('hidden');
}

async function logout() {
    await client.auth.signOut();
    window.location.href = 'index.html';
}

function openTermsModal() {
    document.getElementById('terms-modal').classList.remove('hidden');
}

function closeTermsModal() {
    document.getElementById('terms-modal').classList.add('hidden');
}

function contactSupport() {
    const phone = "254714767240";
    const name = userProfile?.full_name || "Member";
    const message = encodeURIComponent(`Hello Support, I am ${name}. I need assistance with Juvinal Pay.`);
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
}
