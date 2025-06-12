const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = `Bot Concesionario <noreply@${process.env.DOMAIN}>`;
  }

  async sendAppointmentNotification(leadData) {
    try {
      const emailHtml = this.generateAppointmentEmailHtml(leadData);
      const emailText = this.generateAppointmentEmailText(leadData);
      
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: ['jpgomez@stayirrelevant.com'], // Cambiar por el email del concesionario
        subject: `🚗 Nueva cita agendada - ${leadData.cliente.nombre || 'Cliente'}`,
        html: emailHtml,
        text: emailText,
      });

      console.log('✅ Email de cita enviado exitosamente:', response.id);
      return { success: true, id: response.id };
    } catch (error) {
      console.error('❌ Error enviando email de cita:', error);
      return { success: false, error: error.message };
    }
  }

  generateAppointmentEmailText(data) {
    const { cliente, interes, proceso } = data;
    
    return `
Nueva Cita Agendada - Concesionario
ID Lead: ${data.id}

=== INFORMACIÓN DEL CLIENTE ===
Teléfono: ${cliente.celular}
Nombre: ${cliente.nombre || 'No proporcionado'}
Email: ${cliente.email || 'No proporcionado'}

=== INTERÉS DEL CLIENTE ===
Marca de interés: ${interes.marca_interes || 'No especificado'}
Modelo de interés: ${interes.modelo_interes || 'No especificado'}
Tipo de vehículo: ${interes.tipo_vehiculo || 'No especificado'}
Presupuesto máximo: ${interes.presupuesto_max ? `$${interes.presupuesto_max.toLocaleString('es-CO')}` : 'No especificado'}
Vehículo favorito: ${interes.vehiculo_favorito || 'No especificado'}

=== INFORMACIÓN DE LA CITA ===
Fecha: ${proceso.fecha_cita ? new Date(proceso.fecha_cita).toLocaleDateString('es-CO') : 'No especificada'}
Hora: ${proceso.hora_cita || 'No especificada'}
Vehículo a ver: ${proceso.vehiculo_cita || 'No especificado'}
Status: ${proceso.status}

=== VEHÍCULOS CONSULTADOS ===
${interes.vehiculos_consultados ? interes.vehiculos_consultados.join('\n') : 'Ninguno registrado'}

=== INFORMACIÓN DEL PROCESO ===
Fecha de contacto inicial: ${new Date(proceso.fecha_inicio).toLocaleString('es-CO')}
Última actividad: ${proceso.ultima_actividad ? new Date(proceso.ultima_actividad).toLocaleString('es-CO') : 'No registrada'}

---
Bot Concesionario - Sistema Automático de Gestión de Leads
Este email fue generado automáticamente
    `.trim();
  }

  generateAppointmentEmailHtml(data) {
    const { cliente, interes, proceso } = data;
    
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nueva Cita Agendada</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                line-height: 1.6; 
                color: #333;
                background-color: #f5f5f5;
            }
            .container { 
                max-width: 600px; 
                margin: 20px auto; 
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header { 
                background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);
                color: white; 
                padding: 30px 20px; 
                text-align: center; 
            }
            .header h1 {
                font-size: 24px;
                margin-bottom: 10px;
                font-weight: 600;
            }
            .header .id {
                font-size: 14px;
                opacity: 0.9;
                background: rgba(255,255,255,0.2);
                padding: 5px 15px;
                border-radius: 20px;
                display: inline-block;
            }
            .content { 
                padding: 0;
            }
            .section { 
                padding: 25px 30px;
                border-bottom: 1px solid #eee;
           }
           .section:last-child {
               border-bottom: none;
           }
           .section h2 {
               font-size: 18px;
               margin-bottom: 15px;
               color: #2980b9;
               font-weight: 600;
           }
           .info-row { 
               display: flex;
               padding: 8px 0;
               border-bottom: 1px solid #f8f9fa;
           }
           .info-row:last-child {
               border-bottom: none;
           }
           .label { 
               font-weight: 600; 
               color: #555;
               min-width: 140px;
               flex-shrink: 0;
           }
           .value { 
               color: #333;
               flex: 1;
           }
           .status-badge {
               display: inline-block;
               padding: 4px 8px;
               border-radius: 12px;
               font-size: 12px;
               font-weight: 600;
               background: #d4edda;
               color: #155724;
           }
           .footer { 
               background: #2c3e50; 
               color: #bdc3c7; 
               padding: 20px 30px; 
               text-align: center; 
               font-size: 12px; 
           }
           .footer p {
               margin: 5px 0;
           }
           .highlight {
               background: #f8f9fa;
               padding: 15px;
               border-radius: 6px;
               margin: 10px 0;
           }
           .appointment-info {
               background: #e8f5e8;
               padding: 20px;
               border-radius: 8px;
               border-left: 4px solid #28a745;
           }
           @media (max-width: 600px) {
               .container {
                   margin: 10px;
                   border-radius: 0;
               }
               .section {
                   padding: 20px;
               }
               .info-row {
                   flex-direction: column;
               }
               .label {
                   min-width: auto;
                   margin-bottom: 5px;
               }
           }
       </style>
   </head>
   <body>
       <div class="container">
           <div class="header">
               <h1>🚗 Nueva Cita Agendada</h1>
               <div class="id">Lead ID: ${data.id}</div>
           </div>
           
           <div class="content">
               <div class="section">
                   <div class="appointment-info">
                       <h2 style="color: #28a745; margin-bottom: 15px;">📅 Información de la Cita</h2>
                       <div class="info-row">
                           <div class="label">Fecha:</div>
                           <div class="value"><strong>${proceso.fecha_cita ? new Date(proceso.fecha_cita).toLocaleDateString('es-CO') : 'No especificada'}</strong></div>
                       </div>
                       <div class="info-row">
                           <div class="label">Hora:</div>
                           <div class="value"><strong>${proceso.hora_cita || 'No especificada'}</strong></div>
                       </div>
                       <div class="info-row">
                           <div class="label">Vehículo a ver:</div>
                           <div class="value"><strong>${proceso.vehiculo_cita || 'No especificado'}</strong></div>
                       </div>
                   </div>
               </div>
               
               <div class="section">
                   <h2>👤 Información del Cliente</h2>
                   <div class="info-row">
                       <div class="label">Teléfono:</div>
                       <div class="value">${cliente.celular}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Nombre:</div>
                       <div class="value">${cliente.nombre || 'No proporcionado'}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Email:</div>
                       <div class="value">${cliente.email || 'No proporcionado'}</div>
                   </div>
               </div>
               
               <div class="section">
                   <h2>🚗 Interés del Cliente</h2>
                   <div class="info-row">
                       <div class="label">Marca de interés:</div>
                       <div class="value">${interes.marca_interes || 'No especificado'}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Modelo de interés:</div>
                       <div class="value">${interes.modelo_interes || 'No especificado'}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Tipo de vehículo:</div>
                       <div class="value">${interes.tipo_vehiculo || 'No especificado'}</div>
                   </div>
                   ${interes.presupuesto_max ? `
                   <div class="info-row">
                       <div class="label">Presupuesto máximo:</div>
                       <div class="value">$${interes.presupuesto_max.toLocaleString('es-CO')}</div>
                   </div>` : ''}
                   ${interes.vehiculo_favorito ? `
                   <div class="info-row">
                       <div class="label">Vehículo favorito:</div>
                       <div class="value">${interes.vehiculo_favorito}</div>
                   </div>` : ''}
               </div>
               
               ${interes.vehiculos_consultados && interes.vehiculos_consultados.length > 0 ? `
               <div class="section">
                   <h2>🔍 Vehículos Consultados</h2>
                   <div class="highlight">
                       ${interes.vehiculos_consultados.map(vehiculo => `<p>• ${vehiculo}</p>`).join('')}
                   </div>
               </div>` : ''}
               
               <div class="section">
                   <h2>📊 Estado del Proceso</h2>
                   <div class="info-row">
                       <div class="label">Status:</div>
                       <div class="value">
                           <span class="status-badge">${proceso.status}</span>
                       </div>
                   </div>
                   <div class="info-row">
                       <div class="label">Fecha contacto inicial:</div>
                       <div class="value">${new Date(proceso.fecha_inicio).toLocaleString('es-CO')}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Última actividad:</div>
                       <div class="value">${proceso.ultima_actividad ? new Date(proceso.ultima_actividad).toLocaleString('es-CO') : 'No registrada'}</div>
                   </div>
               </div>
           </div>
           
           <div class="footer">
               <p><strong>Bot Concesionario</strong> - Sistema Automático de Gestión de Leads</p>
               <p>Este email fue generado automáticamente el ${new Date().toLocaleString('es-CO')}</p>
               <p>Para consultas técnicas, contactar al administrador del sistema</p>
           </div>
       </div>
   </body>
   </html>`;
  }
}

module.exports = { EmailService };