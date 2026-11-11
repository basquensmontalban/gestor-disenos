// Configuración de la conexión con Google.
// Pega aquí el ID de cliente de Google Cloud (el mismo proyecto que usáis para «Inventario de casa»).
export const CONFIG = {
  GOOGLE_CLIENT_ID: 'PEGA_AQUI_TU_ID.apps.googleusercontent.com',
  // Permiso limitado: la app solo ve los archivos y carpetas que crea ella misma.
  SCOPES: ['https://www.googleapis.com/auth/drive.file'],
  DRIVE_FOLDER_NAME: 'Tienda',
};
