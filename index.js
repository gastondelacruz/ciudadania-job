// monitor-citas.js
require("dotenv").config();
const { chromium } = require("playwright");
const nodemailer = require("nodemailer");

// Configuración del email
const EMAIL_CONFIG = {
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
};

const RECIPIENT_EMAILS = process.env.RECIPIENT_EMAILS;
const URL =
  "https://www.citaconsular.es/es/hosteds/widgetdefault/298f7f17f58c0836448a99edecf16e66a/#services";

// Configurar transportador de email
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

async function enviarEmail(mensaje) {
  try {
    const info = await transporter.sendMail({
      from: EMAIL_CONFIG.auth.user,
      to: RECIPIENT_EMAILS,
      subject: "¡Hay citas disponibles en el Consulado!",
      html: `
        <h2>¡Alerta de Citas Disponibles!</h2>
        <p>El mensaje en la página ha cambiado:</p>
        <blockquote style="background: #f5f5f5; padding: 15px; border-left: 4px solid #4CAF50;">
          ${mensaje}
        </blockquote>
        <p><a href="${URL}">Ir a la página de citas</a></p>
        <p><small>Notificación automática - ${new Date().toLocaleString()}</small></p>
      `,
    });
    console.log("✅ Email enviado con éxito:", info.messageId);
    console.log("📧 Destinatarios:", RECIPIENT_EMAILS);
  } catch (error) {
    console.error("❌ Error enviando email:", error);
  }
}

async function verificarDisponibilidad() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(
      `[${new Date().toLocaleString()}] Verificando disponibilidad...`
    );

    await page.goto(
      "https://www.exteriores.gob.es/Consulados/cordoba/es/Comunicacion/Noticias/Paginas/Articulos/Instrucciones-para-solicitar-cita-previa-para-LMD.aspx"
    );
    page.once("dialog", (dialog) => {
      console.log(`Dialog message: ${dialog.message()}`);
      dialog.dismiss().catch(() => {});
    });
    await page.getByRole("link", { name: "AQUÍ." }).click();
    await page.getByRole("button", { name: "Continue / Continuar" }).click();
    await page.goto(
      "https://www.citaconsular.es/es/hosteds/widgetdefault/298f7f17f58c0836448a99edecf16e66a/#services"
    );

    console.log("⏳ Esperando a que termine el loading...");

    // Esperar a que la página termine de cargar
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {
      console.log("⚠️  Timeout esperando networkidle, continuando...");
    });

    // Esperar a que aparezca el contenedor de servicios o cualquier contenido relevante
    // Buscamos en todos los frames posibles
    let contenidoCargado = false;
    const maxIntentos = 20;
    const delayEntreIntentos = 4000;

    for (let intento = 1; intento <= maxIntentos; intento++) {
      const frames = [page, ...page.frames()];

      for (const frame of frames) {
        try {
          // Intentar encontrar el contenedor de servicios
          const servicesContainer = frame.locator("#idDivBktServicesContainer");
          const containerCount = await servicesContainer.count();

          if (containerCount > 0) {
            // Verificar que el contenedor tenga contenido
            const containerText = await servicesContainer.textContent();
            if (containerText && containerText.trim().length > 0) {
              console.log(
                "✅ Contenedor de servicios encontrado y con contenido"
              );
              contenidoCargado = true;
              break;
            }
          }

          // Alternativa: buscar el texto "No hay horas disponibles" o cualquier contenido
          const noHayHorasElements = frame.getByText(
            "No hay horas disponibles",
            {
              exact: false,
            }
          );
          const count = await noHayHorasElements.count();

          if (count > 0) {
            console.log(
              "✅ Contenido encontrado (texto 'No hay horas disponibles')"
            );
            contenidoCargado = true;
            break;
          }
        } catch (e) {
          // Continuar buscando
        }
      }

      if (contenidoCargado) {
        break;
      }

      if (intento < maxIntentos) {
        console.log(
          `⏳ Intento ${intento}/${maxIntentos}: Esperando contenido...`
        );
        await page.waitForTimeout(delayEntreIntentos);
      }
    }

    if (!contenidoCargado) {
      console.log(
        "⚠️  No se pudo confirmar que el contenido haya cargado completamente"
      );
    }

    // Verificar que el body no esté vacío
    const bodyContent = await page.locator("body").textContent();
    if (!bodyContent || bodyContent.trim() === "") {
      throw new Error("❌ El body de la página está vacío");
    }

    // Obtener todos los frames (incluyendo la página principal)
    const frames = [page, ...page.frames()];
    console.log(
      `📄 Frames encontrados: ${frames.length} (incluyendo página principal)`
    );

    // Buscar en todos los frames (incluyendo la página principal)
    let textoVisibleEncontrado = false;
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      try {
        console.log(
          `🔍 Buscando en frame ${frameIndex === 0 ? "principal" : frameIndex}...`
        );

        // Usar getByText como en el test que funciona
        const noHayHorasElements = frame.getByText("No hay horas disponibles", {
          exact: false,
        });
        const count = await noHayHorasElements.count();

        console.log(`📊 Elementos encontrados con el texto: ${count}`);

        if (count > 0) {
          // Verificar cada elemento encontrado
          for (let i = 0; i < count; i++) {
            try {
              const element = noHayHorasElements.nth(i);
              const isVisible = await element.isVisible({ timeout: 2000 });
              const textContent = await element.textContent();
              const computedStyle = await element.evaluate((el) => {
                return window.getComputedStyle(el).display;
              });

              console.log(
                `🔍 Elemento ${i + 1}: visible=${isVisible}, display=${computedStyle}, text="${textContent?.trim().substring(0, 50)}..."`
              );

              // Verificar que esté visible y no tenga display:none
              if (isVisible && computedStyle !== "none") {
                console.log(
                  "✅ El texto 'No hay horas disponibles' está presente y visible. No hay citas disponibles."
                );
                textoVisibleEncontrado = true;
                break;
              }
            } catch (e) {
              console.log(
                `⚠️  Error verificando elemento ${i + 1}:`,
                e.message
              );
              continue;
            }
          }
        }

        if (textoVisibleEncontrado) {
          break;
        }
      } catch (e) {
        // Continuar buscando en otros frames
        console.log(
          `⚠️  Error buscando en frame ${frameIndex === 0 ? "principal" : frameIndex}, continuando...`,
          e.message
        );
        continue;
      }
    }

    // Enviar email cuando el texto NO está visible (hay citas disponibles)
    if (!textoVisibleEncontrado) {
      console.log(
        "🎉 ¡El texto 'No hay horas disponibles' NO está visible! Posiblemente haya citas disponibles."
      );
      await enviarEmail(
        "El texto de 'No hay horas disponibles' no está visible. ¡Puede haber citas disponibles!"
      );
    } else {
      console.log(
        "ℹ️  El texto 'No hay horas disponibles' está visible. No hay citas disponibles en este momento."
      );
    }
  } catch (error) {
    console.error("❌ Error durante la verificación:", error);
  } finally {
    await browser.close();
  }
}

// Función principal
async function iniciarMonitoreo() {
  console.log("🚀 Iniciando verificación de citas consulares...");

  // Verificación única
  await verificarDisponibilidad();

  console.log("✅ Verificación finalizada.");
}

// Iniciar el monitoreo y cerrar al finalizar
iniciarMonitoreo()
  .then(() => {
    console.log("Proceso finalizado correctamente.");
    process.exit(0); // Salida exitosa
  })
  .catch((error) => {
    console.error("Ocurrió un error en la ejecución principal:", error);
    process.exit(1); // Salida con error
  });

// Manejo de errores no capturados
process.on("unhandledRejection", (error) => {
  console.error("Error no manejado:", error);
  process.exit(1); // Salida con error
});
