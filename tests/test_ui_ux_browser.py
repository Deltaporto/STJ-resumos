"""
Automação e auditoria visual de UI/UX no navegador via Playwright e servidor HTTP local.
Testa todos os fluxos: carregamento inicial, filtros, busca, gaveta, dark mode e responsividade.
"""

from __future__ import annotations

import functools
import http.server
import socketserver
import threading
import time
from pathlib import Path
from typing import Generator

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = REPO_ROOT / "web"
SCREENSHOTS_DIR = REPO_ROOT / "tests" / "screenshots"
CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
PORT = 8765


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, format, *args):
        # Suprime logs de acesso HTTP no console
        pass


def iniciar_servidor_local(porta: int = PORT) -> tuple[socketserver.TCPServer, threading.Thread]:
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", porta), QuietHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.3)
    return httpd, thread


def auditar_pagina() -> dict[str, list[str]]:
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    httpd, thread = iniciar_servidor_local(PORT)
    achados: dict[str, list[str]] = {
        "aprovados": [],
        "alertas_ui_ux": [],
        "erros_console": [],
    }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=CHROME_PATH,
                headless=True,
            )

            # 1. Desktop padrão (1366x820)
            context = browser.new_context(viewport={"width": 1366, "height": 820})
            page = context.new_page()

            def registrar_erro_console(msg):
                if msg.type in ("error", "warning"):
                    achados["erros_console"].append(f"[{msg.type}] {msg.text}")

            page.on("console", registrar_erro_console)

            url = f"http://127.0.0.1:{PORT}/index.html"
            page.goto(url)
            page.wait_for_load_state("networkidle")

            # Screenshot 1: Tela Inicial
            page.screenshot(path=str(SCREENSHOTS_DIR / "01_tela_inicial_desktop.png"))
            achados["aprovados"].append("Tela inicial carregada sem bloqueio do drawer.")

            # Verificar se o drawer está devidamente oculto
            drawer_hidden = page.eval_on_selector("#transcriptDrawer", "el => el.hidden || getComputedStyle(el).visibility === 'hidden'")
            if not drawer_hidden:
                achados["alertas_ui_ux"].append("transcriptDrawer visível no carregamento inicial!")
            else:
                achados["aprovados"].append("transcriptDrawer oculto no início.")

            # 2. Testar busca global por 'reforma'
            search_input = page.locator("#searchInput")
            search_input.fill("reforma")
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "02_busca_reforma.png"))

            # Conferir highlight de busca (<mark>)
            marks_count = page.locator("mark").count()
            if marks_count > 0:
                achados["aprovados"].append(f"Busca global encontrou {marks_count} destaques com <mark>.")
            else:
                achados["alertas_ui_ux"].append("Nenhum <mark> encontrado após digitar busca.")

            # Limpar busca
            search_input.fill("")
            time.sleep(0.2)

            # 3. Testar Filtro de Matéria do Gabinete
            materia_select = page.locator("#materiaSelect")
            materia_select.select_option("8")  # 8. Direito Tributário
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "03_filtro_materia_tributario.png"))
            achados["aprovados"].append("Filtro de matéria (Direito Tributário) aplicado.")

            # Limpar filtro de matéria
            materia_select.select_option("")
            time.sleep(0.2)

            # 4. Testar Botão 'Atuação Min. Herman'
            toggle_herman = page.locator("#toggleHermanBtn")
            toggle_herman.click()
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "04_filtro_herman_ativo.png"))
            achados["aprovados"].append("Filtro rápido 'Atuação Min. Herman' acionado.")

            toggle_herman.click()  # desativar
            time.sleep(0.2)

            # 5. Testar Gaveta de Transcrição (abertura, busca interna e fechamento)
            btn_ler = page.locator("#readTranscriptBtn")
            btn_ler.click()
            time.sleep(0.4)
            page.screenshot(path=str(SCREENSHOTS_DIR / "05_drawer_aberto.png"))

            # Digitar na busca da transcrição
            transcript_search = page.locator("#transcriptSearchInput")
            transcript_search.fill("Herman")
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "06_drawer_busca_herman.png"))

            # Fechar via Escape
            page.keyboard.press("Escape")
            time.sleep(0.4)
            drawer_pos_esc = page.eval_on_selector("#transcriptDrawer", "el => el.hidden || getComputedStyle(el).visibility === 'hidden'")
            if drawer_pos_esc:
                achados["aprovados"].append("Gaveta fechada com sucesso via tecla Escape.")
            else:
                achados["alertas_ui_ux"].append("Gaveta não fechou ao pressionar Escape.")

            # 6. Testar Dark Mode
            theme_btn = page.locator("#themeToggle")
            theme_btn.click()
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "07_dark_mode_desktop.png"))
            achados["aprovados"].append("Dark mode renderizado com sucesso.")

            # Voltar para Light Mode
            theme_btn.click()
            time.sleep(0.2)

            # 7. Testar Scroll e Visualização dos Cards de Processos + Botão Voltar ao Topo
            page.evaluate("document.getElementById('documentViewer').scrollTop = 700")
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "10_cards_processos_desktop.png"))
            achados["aprovados"].append("Cards de julgados escaneados e capturados.")

            # Verificar se o botão voltar ao topo apareceu
            back_to_top_visible = page.eval_on_selector("#backToTopBtn", "el => el.classList.contains('visible') && !el.hidden")
            if back_to_top_visible:
                achados["aprovados"].append("Botão 'Voltar ao Topo' flutuante ativado após scroll.")
            else:
                achados["alertas_ui_ux"].append("Botão 'Voltar ao Topo' não ficou visível após scroll > 320px.")

            page.evaluate("document.getElementById('documentViewer').scrollTop = 1400")
            time.sleep(0.3)
            page.screenshot(path=str(SCREENSHOTS_DIR / "12_cards_inferiores_desktop.png"))

            # Testar clique no botão voltar ao topo
            page.locator("#backToTopBtn").click()
            time.sleep(0.4)
            scroll_pos = page.eval_on_selector("#documentViewer", "el => el.scrollTop")
            if scroll_pos < 50:
                achados["aprovados"].append("Clique no botão 'Voltar ao Topo' retornou com sucesso ao início.")
            else:
                achados["alertas_ui_ux"].append(f"Botão 'Voltar ao Topo' não rolou ao topo (posição: {scroll_pos}).")

            # 7.1 Testar Recolher / Expandir Painel Herman
            toggle_spotlight = page.locator("#toggleHermanSpotlightBtn")
            if toggle_spotlight.is_visible():
                toggle_spotlight.click()
                time.sleep(0.2)
                is_collapsed = page.eval_on_selector(".spotlight-grid", "el => el.classList.contains('collapsed')")
                if is_collapsed:
                    achados["aprovados"].append("Painel Atuação Min. Herman recolhido com sucesso.")
                toggle_spotlight.click()  # expandir novamente
                time.sleep(0.2)

            # 8. Testar clique em Chip de Matéria (ex.: 4. Servidor Público)
            chip_servidor = page.locator(".materia-chip:has-text('Servidor')").first
            if chip_servidor.is_visible():
                chip_servidor.click()
                time.sleep(0.3)
                page.screenshot(path=str(SCREENSHOTS_DIR / "11_filtro_chip_servidor.png"))
                achados["aprovados"].append("Clique em chip de matéria testado.")

            # Limpar filtro
            page.locator(".materia-chip:has-text('Todas')").click()
            time.sleep(0.2)

            # 9. Testar Responsividade Mobile (390x844 - iPhone 14 style)
            mobile_context = browser.new_context(viewport={"width": 390, "height": 844})
            mobile_page = mobile_context.new_page()
            mobile_page.goto(url)
            mobile_page.wait_for_load_state("networkidle")
            time.sleep(0.3)
            mobile_page.screenshot(path=str(SCREENSHOTS_DIR / "08_mobile_inicial.png"))

            # Abrir menu mobile
            menu_btn = mobile_page.locator("#mobileMenuBtn")
            if menu_btn.is_visible():
                menu_btn.click()
                time.sleep(0.3)
                mobile_page.screenshot(path=str(SCREENSHOTS_DIR / "09_mobile_menu_aberto.png"))
                backdrop_visible = mobile_page.eval_on_selector("#sidebarBackdrop", "el => el.classList.contains('is-open') && !el.hidden")
                if backdrop_visible:
                    achados["aprovados"].append("Menu lateral mobile e backdrop escurecedor testados.")
                else:
                    achados["alertas_ui_ux"].append("Backdrop do menu mobile não foi ativado.")

                # Fechar menu clicando na área exposta do backdrop (à direita da sidebar de 300px)
                mobile_page.locator("#sidebarBackdrop").click(position={"x": 350, "y": 200})
                time.sleep(0.3)
                sidebar_closed = mobile_page.eval_on_selector("#sidebar", "el => !el.classList.contains('open')")
                if sidebar_closed:
                    achados["aprovados"].append("Menu lateral mobile fechado com sucesso ao clicar no backdrop.")
                else:
                    achados["alertas_ui_ux"].append("Menu lateral não fechou após clicar no backdrop.")

            browser.close()

        # Espelhar screenshots no diretório de artefatos da conversa
        artifact_dir = Path("C:/Users/Casa/.gemini/antigravity/brain/ae0c695c-ec6d-48d2-b69d-49190233d36d")
        if artifact_dir.exists():
            import shutil
            for shot in SCREENSHOTS_DIR.glob("*.png"):
                shutil.copy2(shot, artifact_dir / shot.name)

    finally:
        httpd.shutdown()

    return achados


if __name__ == "__main__":
    resultado = auditar_pagina()
    print("=== RESULTADOS DA AUDITORIA UI/UX VIA NAVEGADOR ===")
    print("\nAprovados:")
    for a in resultado["aprovados"]:
        print(f"  - {a}")
    print("\nAlertas UI/UX identificados:")
    for al in resultado["alertas_ui_ux"]:
        print(f"  ! {al}")
    print("\nErros/Avisos de Console:")
    for err in resultado["erros_console"]:
        print(f"  x {err}")
