let supabase = null;
let html5QrcodeScanner = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarCredenciais();
    gerarCamposGabarito();
});

// Troca de Abas
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabId}`).classList.add('active');
    event.currentTarget.classList.add('active');

    if (tabId === 'turmas') carregarTurmas();
    if (tabId === 'provas') carregarProvas();
    if (tabId === 'relatorios') carregarRelatorios();
    if (tabId === 'dashboard') carregarDashboard();
}

// Inicializar Supabase
function carregarCredenciais() {
    const url = localStorage.getItem('gaba_supabase_url');
    const key = localStorage.getItem('gaba_supabase_key');

    if (url && key) {
        document.getElementById('cfg-url').value = url;
        document.getElementById('cfg-key').value = key;
        supabase = window.supabase.createClient(url, key);
        
        const badge = document.getElementById('status-conexao');
        badge.textContent = 'Supabase Conectado';
        badge.className = 'badge badge-on';

        carregarDashboard();
    }
}

// Salvar Credenciais
document.getElementById('form-config').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('cfg-url').value.trim();
    const key = document.getElementById('cfg-key').value.trim();

    localStorage.setItem('gaba_supabase_url', url);
    localStorage.setItem('gaba_supabase_key', key);
    alert('Credenciais salvas com sucesso!');
    carregarCredenciais();
});

// Gerar campos de gabarito dinamicamente
function gerarCamposGabarito() {
    const qtd = parseInt(document.getElementById('prova-qtd').value) || 10;
    const container = document.getElementById('gabarito-inputs');
    container.innerHTML = '';

    for (let i = 1; i <= qtd; i++) {
        const div = document.createElement('div');
        div.innerHTML = `
            <label>Q${i}:</label>
            <select class="gab-q" data-q="${i}">
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
            </select>
        `;
        container.appendChild(div);
    }
}

// Lógica de Leitura por Câmera (HTML5 QRCode)
function iniciarCamera() {
    document.getElementById('btn-iniciar-camera').style.display = 'none';
    document.getElementById('btn-parar-camera').style.display = 'inline-block';

    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            document.getElementById('resultado-scan').style.display = 'block';
            document.getElementById('resultado-detalhes').innerHTML = `<p><strong>Leitura:</strong> ${decodedText}</p>`;
        },
        (errorMessage) => {}
    );
}

function pararCamera() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            document.getElementById('btn-iniciar-camera').style.display = 'inline-block';
            document.getElementById('btn-parar-camera').style.display = 'none';
        });
    }
}

// Carregar Dados Dashboard
async function carregarDashboard() {
    if (!supabase) return;
    try {
        const { count: turmasCount } = await supabase.from('turmas').select('*', { count: 'exact', head: true });
        const { count: alunosCount } = await supabase.from('alunos').select('*', { count: 'exact', head: true });
        const { count: provasCount } = await supabase.from('provas').select('*', { count: 'exact', head: true });

        document.getElementById('dash-turmas-count').textContent = turmasCount || 0;
        document.getElementById('dash-alunos-count').textContent = alunosCount || 0;
        document.getElementById('dash-provas-count').textContent = provasCount || 0;
    } catch (err) {
        console.error(err);
    }
}