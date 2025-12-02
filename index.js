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

    // ⭐ Esperar a que el iframe cargue
    await page.waitForTimeout(3000);

    // Obtener todos los frames
    const frames = page.frames();
    console.log(`📄 Frames encontrados: ${frames.length}`);

    // Buscar en todos los frames
    let encontrado = false;
    for (const frame of frames) {
      try {
        const noHayHorasText = frame
          .locator('text="No hay horas disponibles."')
          .first();
        const isVisible = await noHayHorasText.isVisible({ timeout: 1000 });

        if (isVisible) {
          console.log("✅ El texto 'No hay horas disponibles' fue encontrado.");
          encontrado = true;
          break;
        }
      } catch (e) {
        // Continuar buscando en otros frames
        continue;
      }
    }

    if (!encontrado) {
      console.log(
        "🎉 ¡El texto 'No hay horas disponibles' no fue encontrado! Posiblemente haya citas."
      );
      await enviarEmail(
        "El texto de 'No hay horas disponibles' ha desaparecido. ¡Puede haber citas disponibles!"
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
