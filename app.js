let supabase = null;
let html5QrcodeScanner = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarCredenciais();
    gerarCamposGabarito();
});

// Troca de Abas (Corrigida e à prova de falhas)
function switchTab(tabId) {
    try {
        // Esconde todas as abas e botões
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        // Mostra a aba selecionada
        const tabAlvo = document.getElementById(`tab-${tabId}`);
        if (tabAlvo) tabAlvo.classList.add('active');

        // Pinta o botão correto
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('onclick').includes(tabId)) {
                btn.classList.add('active');
            }
        });

        // Executa o carregamento de dados da aba
        if (tabId === 'turmas') carregarTurmas();
        if (tabId === 'provas') carregarProvas();
        if (tabId === 'relatorios') carregarRelatorios();
        if (tabId === 'dashboard') carregarDashboard();
    } catch (erro) {
        console.error("Erro ao trocar de aba:", erro);
    }
}

// Inicializar Supabase
function carregarCredenciais() {
    const url = localStorage.getItem('gaba_supabase_url');
    const key = localStorage.getItem('gaba_supabase_key');

    if (url && key) {
        const inputUrl = document.getElementById('cfg-url');
        const inputKey = document.getElementById('cfg-key');
        if (inputUrl) inputUrl.value = url;
        if (inputKey) inputKey.value = key;

        supabase = window.supabase.createClient(url, key);
        
        const badge = document.getElementById('status-conexao');
        if (badge) {
            badge.textContent = 'Supabase Conectado';
            badge.className = 'badge badge-on';
        }

        carregarDashboard();
    }
}

// Salvar Credenciais
const formConfig = document.getElementById('form-config');
if (formConfig) {
    formConfig.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('cfg-url').value.trim();
        const key = document.getElementById('cfg-key').value.trim();

        localStorage.setItem('gaba_supabase_url', url);
        localStorage.setItem('gaba_supabase_key', key);
        alert('Credenciais salvas com sucesso!');
        carregarCredenciais();
    });
}

// Carregar Turmas do Supabase
async function carregarTurmas() {
    if (!supabase) return;
    const lista = document.getElementById('lista-turmas');
    const select = document.getElementById('aluno-turma-select');
    try {
        const { data: turmas, error } = await supabase.from('turmas').select('*');
        if (error) throw error;

        if (lista) {
            lista.innerHTML = (turmas && turmas.length > 0) ? '' : '<p class="text-muted">Nenhuma turma cadastrada.</p>';
            turmas?.forEach(t => {
                lista.innerHTML += `<div class="card"><strong>${t.nome}</strong> (${t.ano})</div>`;
            });
        }
        if (select) {
            select.innerHTML = '<option value="">Selecione a Turma...</option>';
            turmas?.forEach(t => {
                select.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar turmas:', err);
    }
}

// Carregar Provas do Supabase
async function carregarProvas() {
    if (!supabase) return;
    const lista = document.getElementById('lista-provas');
    const selectScan = document.getElementById('select-prova-scan');
    try {
        const { data: provas, error } = await supabase.from('provas').select('*');
        if (error) throw error;

        if (lista) {
            lista.innerHTML = (provas && provas.length > 0) ? '' : '<p class="text-muted">Nenhuma prova cadastrada.</p>';
            provas?.forEach(p => {
                lista.innerHTML += `<div class="card"><strong>${p.titulo}</strong> - ${p.disciplina}</div>`;
            });
        }
        if (selectScan) {
            selectScan.innerHTML = '<option value="">Selecione a Prova para Corrigir...</option>';
            provas?.forEach(p => {
                selectScan.innerHTML += `<option value="${p.id}">${p.titulo}</option>`;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar provas:', err);
    }
}

// Carregar Relatórios de Notas
async function carregarRelatorios() {
    if (!supabase) return;
    const tabela = document.getElementById('tabela-relatorios');
    try {
        const { data: correcoes, error } = await supabase.from('correcoes').select('*, alunos(nome), turmas(nome), provas(titulo)');
        if (error) throw error;

        if (tabela) {
            if (!correcoes || correcoes.length === 0) {
                tabela.innerHTML = '<tr><td colspan="5" class="text-muted">Nenhuma correção registrada ainda.</td></tr>';
            } else {
                tabela.innerHTML = correcoes.map(c => `
                    <tr>
                        <td>${new Date(c.created_at).toLocaleDateString()}</td>
                        <td>${c.alunos?.nome || '-'}</td>
                        <td>${c.turmas?.nome || '-'}</td>
                        <td>${c.provas?.titulo || '-'}</td>
                        <td><strong>${c.nota}</strong></td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        console.error('Erro ao carregar relatórios:', err);
    }
}

// Gerar campos de gabarito dinamicamente
function gerarCamposGabarito() {
    const inputQtd = document.getElementById('prova-qtd');
    if (!inputQtd) return;
    const qtd = parseInt(inputQtd.value) || 10;
    const container = document.getElementById('gabarito-inputs');
    if (!container) return;
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

        if (document.getElementById('dash-turmas-count')) document.getElementById('dash-turmas-count').textContent = turmasCount || 0;
        if (document.getElementById('dash-alunos-count')) document.getElementById('dash-alunos-count').textContent = alunosCount || 0;
        if (document.getElementById('dash-provas-count')) document.getElementById('dash-provas-count').textContent = provasCount || 0;
    } catch (err) {
        console.error(err);
    }
}