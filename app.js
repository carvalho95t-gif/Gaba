let supabase = null;
let html5QrcodeScanner = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarCredenciais();
    gerarCamposGabarito();
});

// Troca de Abas
function switchTab(tabId) {
    try {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        const tabAlvo = document.getElementById(`tab-${tabId}`);
        if (tabAlvo) tabAlvo.classList.add('active');

        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
                btn.classList.add('active');
            }
        });

        if (tabId === 'turmas') carregarTurmas();
        if (tabId === 'provas') carregarProvas();
        if (tabId === 'relatorios') carregarRelatorios();
        if (tabId === 'dashboard') carregarDashboard();
    } catch (erro) {
        console.error("Erro ao trocar de aba:", erro);
    }
}

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

async function carregarTurmas() {
    if (!supabase) return;
    try {
        const { data: turmas, error } = await supabase.from('turmas').select('*');
        if (error) throw error;
    } catch (err) {
        console.error('Erro ao carregar turmas:', err);
    }
}

async function carregarProvas() {
    if (!supabase) return;
}

async function carregarRelatorios() {
    if (!supabase) return;
}

async function carregarDashboard() {
    if (!supabase) return;
}

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

// Gerar Folhas de Gabarito para Impressão
async function imprimirGabaritos(provaId, turmaId, qtdQuestoes) {
    if (!supabase) return alert("Conecte o Supabase primeiro!");

    try {
        const { data: prova } = await supabase.from('provas').select('*').eq('id', provaId).single();
        const { data: turma } = await supabase.from('turmas').select('*').eq('id', turmaId).single();
        const { data: alunos, error } = await supabase.from('alunos').select('*').eq('turma_id', turmaId);
        
        if (error || !alunos || alunos.length === 0) {
            return alert("Nenhum aluno encontrado nesta turma.");
        }

        const areaImpressao = document.getElementById('area-impressao');
        areaImpressao.innerHTML = '';

        alunos.forEach(aluno => {
            const qrData = `Gaba|${aluno.id}|${prova.id}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;

            let bolinhasHTML = '<div class="bolinhas-grid">';
            for (let i = 1; i <= qtdQuestoes; i++) {
                bolinhasHTML += `
                    <div><strong>${i < 10 ? '0'+i : i}</strong></div>
                    <div class="bolinha">A</div>
                    <div class="bolinha">B</div>
                    <div class="bolinha">C</div>
                    <div class="bolinha">D</div>
                    <div class="bolinha">E</div>
                `;
            }
            bolinhasHTML += '</div>';

            areaImpressao.innerHTML += `
                <div class="folha-gabarito">
                    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px;">
                        <div>
                            <h2>GABA OMR - Folha de Respostas</h2>
                            <p><strong>Prova:</strong> ${prova.titulo} (${prova.disciplina})</p>
                            <p><strong>Turma:</strong> ${turma.nome}</p>
                            <p><strong>Aluno:</strong> ${aluno.numero} - ${aluno.nome}</p>
                        </div>
                        <div>
                            <img src="${qrUrl}" alt="QR Code Aluno" style="width: 100px; height: 100px;">
                        </div>
                    </div>
                    ${bolinhasHTML}
                </div>
            `;
        });

        window.print();

    } catch (err) {
        console.error("Erro ao gerar impressão:", err);
        alert("Erro ao gerar os gabaritos.");
    }
}