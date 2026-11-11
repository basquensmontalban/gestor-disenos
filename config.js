// Configuración de la conexión con Google.
// Pega aquí el ID de cliente de Google Cloud (el mismo proyecto que usáis para «Inventario de casa»).
export const CONFIG = {
  GOOGLE_CLIENT_ID: '282335662414-t070oa59ds0ds8f1vicfek6qgd2fktj7.apps.googleusercontent.com',
  // Permiso limitado: la app solo ve los archivos y carpetas que crea ella misma.
  SCOPES: ['https://www.googleapis.com/auth/drive.file'],
  DRIVE_FOLDER_NAME: 'Tienda',
};
