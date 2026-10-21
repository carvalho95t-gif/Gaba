let db = null;
let html5QrcodeScanner = null;
let processandoScan = false;

document.addEventListener("DOMContentLoaded", () => {
    const nav = document.getElementById("nav-tabs");
    if (nav) {
        nav.addEventListener("click", (event) => {
            const btn = event.target.closest("[data-tab]");
            if (!btn) return;
            switchTab(btn.getAttribute("data-tab"));
        });
    }

    const qtd = document.getElementById("prova-qtd");
    if (qtd) qtd.addEventListener("change", gerarCamposGabarito);

    const btnStart = document.getElementById("btn-iniciar-camera");
    const btnStop = document.getElementById("btn-parar-camera");
    if (btnStart) btnStart.addEventListener("click", iniciarCamera);
    if (btnStop) btnStop.addEventListener("click", pararCamera);

    ligarFormularios();
    carregarCredenciais();
    gerarCamposGabarito();
});

function switchTab(tabId) {
    const tabAlvo = document.getElementById("tab-" + tabId);
    if (!tabAlvo) {
        console.error("Aba não encontrada:", tabId);
        return;
    }

    document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((el) => el.classList.remove("active"));

    tabAlvo.classList.add("active");
    document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
        if (btn.getAttribute("data-tab") === tabId) btn.classList.add("active");
    });

    if (tabId !== "scanner") pararCamera();

    if (tabId === "turmas") carregarTurmas();
    if (tabId === "provas") carregarProvas();
    if (tabId === "scanner") carregarProvas();
    if (tabId === "relatorios") carregarRelatorios();
    if (tabId === "dashboard") carregarDashboard();
}

window.switchTab = switchTab;

function exigirSupabase() {
    if (db) return true;
    alert("Conecte o Supabase na aba Config antes de continuar.");
    switchTab("config");
    return false;
}

function criarClienteSupabase(url, key) {
    const lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") {
        throw new Error("Biblioteca supabase-js não carregou. Verifique a conexão com a CDN.");
    }
    return lib.createClient(url, key);
}

function carregarCredenciais() {
    const url = localStorage.getItem("gaba_supabase_url");
    const key = localStorage.getItem("gaba_supabase_key") || localStorage.getItem("gaba_supabase_anon_key");

    if (url && key) {
        const inputUrl = document.getElementById("cfg-url");
        const inputKey = document.getElementById("cfg-key");
        if (inputUrl) inputUrl.value = url;
        if (inputKey) inputKey.value = key;

        try {
            db = criarClienteSupabase(url, key);
        } catch (err) {
            console.error(err);
            db = null;
            return;
        }

        const badge = document.getElementById("status-conexao");
        if (badge) {
            badge.textContent = "Supabase Conectado";
            badge.className = "badge badge-on";
        }

        carregarDashboard();
    }
}

function ligarFormularios() {
    const formConfig = document.getElementById("form-config");
    if (formConfig) {
        formConfig.addEventListener("submit", (e) => {
            e.preventDefault();
            const url = document.getElementById("cfg-url").value.trim();
            const key = document.getElementById("cfg-key").value.trim();
            localStorage.setItem("gaba_supabase_url", url);
            localStorage.setItem("gaba_supabase_key", key);
            localStorage.setItem("gaba_supabase_anon_key", key);
            alert("Credenciais salvas com sucesso!");
            carregarCredenciais();
        });
    }

    const formTurma = document.getElementById("form-turma");
    if (formTurma) {
        formTurma.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!exigirSupabase()) return;
            const nome = document.getElementById("turma-nome").value.trim();
            const ano = document.getElementById("turma-ano").value.trim();
            const { error } = await db.from("turmas").insert({ nome, ano });
            if (error) {
                alert("Erro ao salvar turma: " + error.message);
                return;
            }
            formTurma.reset();
            await carregarTurmas();
            await carregarDashboard();
        });
    }

    const formAluno = document.getElementById("form-aluno");
    if (formAluno) {
        formAluno.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!exigirSupabase()) return;
            const turma_id = document.getElementById("aluno-turma-select").value;
            const nome = document.getElementById("aluno-nome").value.trim();
            const numero = Number(document.getElementById("aluno-numero").value);
            const { error } = await db.from("alunos").insert({ turma_id, nome, numero });
            if (error) {
                alert("Erro ao salvar aluno: " + error.message);
                return;
            }
            formAluno.reset();
            await carregarTurmas();
            await carregarDashboard();
        });
    }

    const formProva = document.getElementById("form-prova");
    if (formProva) {
        formProva.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!exigirSupabase()) return;
            const titulo = document.getElementById("prova-titulo").value.trim();
            const disciplina = document.getElementById("prova-disciplina").value.trim();
            const quantidade_questoes = Number(document.getElementById("prova-qtd").value);
            const gabarito = Array.from(document.querySelectorAll(".gab-q")).map((sel) => sel.value);
            const { error } = await db.from("provas").insert({
                titulo,
                disciplina,
                quantidade_questoes,
                gabarito
            });
            if (error) {
                alert("Erro ao salvar prova: " + error.message);
                return;
            }
            formProva.reset();
            document.getElementById("prova-qtd").value = "10";
            gerarCamposGabarito();
            await carregarProvas();
            await carregarDashboard();
        });
    }
}

async function carregarTurmas() {
    const lista = document.getElementById("lista-turmas");
    const select = document.getElementById("aluno-turma-select");
    if (!db) {
        if (lista) lista.innerHTML = '<p class="text-muted">Conecte o Supabase na aba Config.</p>';
        return;
    }
    try {
        const { data: turmas, error } = await db
            .from("turmas")
            .select("*, alunos(id, nome, numero)")
            .order("nome");
        if (error) throw error;

        if (lista) {
            if (!turmas || turmas.length === 0) {
                lista.innerHTML = '<p class="text-muted">Nenhuma turma cadastrada.</p>';
            } else {
                lista.innerHTML = turmas.map((t) => {
                    const alunos = t.alunos || [];
                    const nomes = alunos.length
                        ? alunos.map((a) => a.numero + " — " + a.nome).join("<br>")
                        : "<em>Sem alunos</em>";
                    return `<div class="card" style="text-align:left"><strong>${t.nome}</strong> (${t.ano})<p class="text-muted">${alunos.length} aluno(s)</p><p>${nomes}</p></div>`;
                }).join("");
            }
        }
        if (select) {
            const atual = select.value;
            select.innerHTML = '<option value="">Selecione a Turma...</option>';
            (turmas || []).forEach((t) => {
                select.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
            });
            if (atual) select.value = atual;
        }
    } catch (err) {
        console.error("Erro ao carregar turmas:", err);
        if (lista) lista.innerHTML = '<p class="text-muted">Erro ao carregar turmas. Confira o SQL e o RLS no Supabase.</p>';
    }
}

async function carregarProvas() {
    const lista = document.getElementById("lista-provas");
    const selectScan = document.getElementById("select-prova-scan");
    if (!db) {
        if (lista) lista.innerHTML = '<p class="text-muted">Conecte o Supabase na aba Config.</p>';
        return;
    }
    try {
        const { data: provas, error } = await db.from("provas").select("*").order("created_at", { ascending: false });
        if (error) throw error;

        if (lista) {
            if (!provas || provas.length === 0) {
                lista.innerHTML = '<p class="text-muted">Nenhuma prova cadastrada.</p>';
            } else {
                lista.innerHTML = provas.map((p) =>
                    `<div class="card" style="text-align:left"><strong>${p.titulo}</strong> — ${p.disciplina}<p class="text-muted">${p.quantidade_questoes || (p.gabarito || []).length} questões</p></div>`
                ).join("");
            }
        }
        if (selectScan) {
            const atual = selectScan.value;
            selectScan.innerHTML = '<option value="">Selecione a Prova para Corrigir...</option>';
            (provas || []).forEach((p) => {
                selectScan.innerHTML += `<option value="${p.id}">${p.titulo}</option>`;
            });
            if (atual) selectScan.value = atual;
        }
    } catch (err) {
        console.error("Erro ao carregar provas:", err);
        if (lista) lista.innerHTML = '<p class="text-muted">Erro ao carregar provas. Confira o SQL e o RLS no Supabase.</p>';
    }
}

async function carregarRelatorios() {
    const tabela = document.getElementById("tabela-relatorios");
    if (!db) {
        if (tabela) tabela.innerHTML = '<tr><td colspan="5" class="text-muted">Conecte o Supabase na aba Config.</td></tr>';
        return;
    }
    try {
        const { data: correcoes, error } = await db
            .from("correcoes")
            .select("*, alunos(nome), turmas(nome), provas(titulo)")
            .order("created_at", { ascending: false });
        if (error) throw error;

        if (tabela) {
            if (!correcoes || correcoes.length === 0) {
                tabela.innerHTML = '<tr><td colspan="5" class="text-muted">Nenhuma correção registrada ainda.</td></tr>';
            } else {
                tabela.innerHTML = correcoes.map((c) => `
                    <tr>
                        <td>${c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "-"}</td>
                        <td>${c.alunos?.nome || "-"}</td>
                        <td>${c.turmas?.nome || "-"}</td>
                        <td>${c.provas?.titulo || "-"}</td>
                        <td><strong>${Number(c.nota).toFixed(2)}</strong></td>
                    </tr>
                `).join("");
            }
        }
    } catch (err) {
        console.error("Erro ao carregar relatórios:", err);
        if (tabela) tabela.innerHTML = '<tr><td colspan="5" class="text-muted">Erro ao carregar notas. Confira o SQL e o RLS no Supabase.</td></tr>';
    }
}

function gerarCamposGabarito() {
    const inputQtd = document.getElementById("prova-qtd");
    if (!inputQtd) return;
    const qtd = parseInt(inputQtd.value, 10) || 10;
    const container = document.getElementById("gabarito-inputs");
    if (!container) return;
    container.innerHTML = "";

    for (let i = 1; i <= qtd; i++) {
        const div = document.createElement("div");
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
    const provaId = document.getElementById("select-prova-scan").value;
    if (!provaId) {
        alert("Selecione a prova antes de ligar a câmera.");
        return;
    }
    if (typeof Html5Qrcode === "undefined") {
        alert("Biblioteca html5-qrcode não carregou.");
        return;
    }

    document.getElementById("btn-iniciar-camera").style.display = "none";
    document.getElementById("btn-parar-camera").style.display = "inline-block";

    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            processarLeitura(decodedText);
        },
        () => {}
    ).catch((err) => {
        console.error(err);
        alert("Não foi possível ligar a câmera. Permita o acesso no navegador.");
        document.getElementById("btn-iniciar-camera").style.display = "inline-block";
        document.getElementById("btn-parar-camera").style.display = "none";
    });
}

function pararCamera() {
    if (!html5QrcodeScanner) return;
    html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner = null;
        const start = document.getElementById("btn-iniciar-camera");
        const stop = document.getElementById("btn-parar-camera");
        if (start) start.style.display = "inline-block";
        if (stop) stop.style.display = "none";
    }).catch(() => {
        html5QrcodeScanner = null;
    });
}

function parseQr(decodedText) {
    const raw = String(decodedText || "").trim();
    try {
        const json = JSON.parse(raw);
        return {
            numero: Number(json.numero || json.matricula),
            respostas: Array.isArray(json.respostas) ? json.respostas : String(json.respostas || "").split(",")
        };
    } catch (_e) {
        const parts = raw.split("|");
        if (parts.length >= 3 && parts[0].toLowerCase() === "gaba") {
            return {
                numero: Number(parts[1]),
                respostas: parts[2].split(",").map((s) => s.trim().toUpperCase())
            };
        }
        if (parts.length === 2) {
            return {
                numero: Number(parts[0]),
                respostas: parts[1].split(",").map((s) => s.trim().toUpperCase())
            };
        }
    }
    return null;
}

async function processarLeitura(decodedText) {
    if (processandoScan) return;
    processandoScan = true;
    try {
        if (!exigirSupabase()) return;
        const provaId = document.getElementById("select-prova-scan").value;
        const parsed = parseQr(decodedText);
        const box = document.getElementById("resultado-scan");
        const detalhes = document.getElementById("resultado-detalhes");
        if (box) box.style.display = "block";

        if (!parsed || !parsed.numero || !parsed.respostas.length) {
            if (detalhes) detalhes.innerHTML = `<p>QR lido, mas o formato não foi reconhecido.</p><p><code>${decodedText}</code></p>`;
            return;
        }

        const { data: prova, error: provaErr } = await db.from("provas").select("*").eq("id", provaId).single();
        if (provaErr) throw provaErr;

        const { data: aluno, error: alunoErr } = await db
            .from("alunos")
            .select("*, turmas(nome)")
            .eq("numero", parsed.numero)
            .maybeSingle();
        if (alunoErr) throw alunoErr;
        if (!aluno) {
            if (detalhes) detalhes.innerHTML = `<p>Aluno nº ${parsed.numero} não encontrado.</p>`;
            return;
        }

        const gabarito = prova.gabarito || [];
        const respostas = parsed.respostas.slice(0, gabarito.length);
        let acertos = 0;
        gabarito.forEach((oficial, i) => {
            if (String(respostas[i] || "").toUpperCase() === String(oficial).toUpperCase()) acertos += 1;
        });
        const total = gabarito.length || 1;
        const nota = Number(((acertos / total) * 10).toFixed(2));

        const { error: insertErr } = await db.from("correcoes").insert({
            aluno_id: aluno.id,
            turma_id: aluno.turma_id,
            prova_id: prova.id,
            respostas,
            acertos,
            total_questoes: total,
            nota
        });
        if (insertErr) throw insertErr;

        if (detalhes) {
            detalhes.innerHTML = `
                <p><strong>Aluno:</strong> ${aluno.nome}</p>
                <p><strong>Prova:</strong> ${prova.titulo}</p>
                <p><strong>Acertos:</strong> ${acertos}/${total}</p>
                <p><strong>Nota:</strong> ${nota.toFixed(2)}</p>
            `;
        }
        await carregarDashboard();
    } catch (err) {
        console.error(err);
        const detalhes = document.getElementById("resultado-detalhes");
        if (detalhes) detalhes.innerHTML = `<p>Falha ao salvar correção: ${err.message || err}</p>`;
    } finally {
        setTimeout(() => {
            processandoScan = false;
        }, 1500);
    }
}

async function carregarDashboard() {
    if (!db) return;
    try {
        const [{ count: turmasCount }, { count: alunosCount }, { count: provasCount }, { count: correcoesCount }] = await Promise.all([
            db.from("turmas").select("*", { count: "exact", head: true }),
            db.from("alunos").select("*", { count: "exact", head: true }),
            db.from("provas").select("*", { count: "exact", head: true }),
            db.from("correcoes").select("*", { count: "exact", head: true })
        ]);

        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value || 0;
        };
        set("dash-turmas-count", turmasCount);
        set("dash-alunos-count", alunosCount);
        set("dash-provas-count", provasCount);
        set("dash-correcoes-count", correcoesCount);
    } catch (err) {
        console.error(err);
    }
}
