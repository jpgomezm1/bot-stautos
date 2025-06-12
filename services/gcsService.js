const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

class GCSService {
  constructor() {
    this.storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    this.bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    this.audioFolder = process.env.GOOGLE_CLOUD_STORAGE_FOLDER || 'Autos-ST';
    this.bucket = this.storage.bucket(this.bucketName);
    
    console.log(`📁 GCS configurado: gs://${this.bucketName}/${this.audioFolder}/`);
  }

  async uploadAudio(localFilePath, fileName) {
    try {
      const destination = `${this.audioFolder}/${fileName}`;
      
      console.log(`📤 Subiendo ${fileName} a GCS...`);
      
      // Subir archivo con metadata que lo hace público
      await this.bucket.upload(localFilePath, {
        destination: destination,
        metadata: {
          cacheControl: 'public, max-age=3600',
          contentType: 'audio/mpeg'
        },
        // Esta opción hace que el archivo sea público automáticamente
        // cuando el bucket tiene uniform bucket-level access
        predefinedAcl: 'publicRead'
      });
      
      // Generar URL pública
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${destination}`;
      
      console.log(`✅ Audio subido a GCS: ${publicUrl}`);
      
      return {
        success: true,
        publicUrl: publicUrl,
        fileName: fileName,
        gcsPath: `gs://${this.bucketName}/${destination}`
      };
      
    } catch (error) {
      console.error('❌ Error subiendo a GCS:', error.message);
      
      // Si falla con predefinedAcl, intentar sin él
      if (error.message.includes('predefinedAcl') || error.message.includes('uniform bucket-level access')) {
        try {
          console.log('🔄 Reintentando subida sin predefinedAcl...');
          
          const destination = `${this.audioFolder}/${fileName}`;
          
          await this.bucket.upload(localFilePath, {
            destination: destination,
            metadata: {
              cacheControl: 'public, max-age=3600',
              contentType: 'audio/mpeg'
            }
            // Sin predefinedAcl para buckets con uniform access
          });
          
          const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${destination}`;
          
          console.log(`✅ Audio subido a GCS (método 2): ${publicUrl}`);
          
          return {
            success: true,
            publicUrl: publicUrl,
            fileName: fileName,
            gcsPath: `gs://${this.bucketName}/${destination}`
          };
          
        } catch (retryError) {
          console.error('❌ Error en reintento:', retryError.message);
          return {
            success: false,
            error: retryError.message
          };
        }
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteAudio(fileName) {
    try {
      const filePath = `${this.audioFolder}/${fileName}`;
      const file = this.bucket.file(filePath);
      
      await file.delete();
      console.log(`🗑️ Archivo eliminado de GCS: ${fileName}`);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error eliminando de GCS:', error.message);
      return { success: false, error: error.message };
    }
  }

  async listAudios() {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: `${this.audioFolder}/`,
        delimiter: '/'
      });
      
      const audioFiles = files
        .filter(file => file.name.endsWith('.mp3'))
        .map(file => ({
          name: file.name,
          publicUrl: `https://storage.googleapis.com/${this.bucketName}/${file.name}`,
          timeCreated: file.metadata.timeCreated,
          size: file.metadata.size
        }));
      
      return {
        success: true,
        files: audioFiles,
        total: audioFiles.length
      };
    } catch (error) {
      console.error('❌ Error listando audios:', error.message);
      return {
        success: false,
        error: error.message,
        files: []
      };
    }
  }

  async cleanOldAudios(maxAgeHours = 24) {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: `${this.audioFolder}/`
      });
      
      const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.name.endsWith('.mp3') && new Date(file.metadata.timeCreated) < cutoffTime) {
          try {
            await file.delete();
            console.log(`🗑️ Audio antiguo eliminado: ${file.name}`);
            deletedCount++;
          } catch (deleteError) {
            console.error(`❌ Error eliminando ${file.name}:`, deleteError.message);
          }
        }
      }
      
      return {
        success: true,
        deletedCount: deletedCount,
        message: `${deletedCount} audios antiguos eliminados`
      };
    } catch (error) {
      console.error('❌ Error limpiando audios antiguos:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testConnection() {
    try {
      // Verificar que el bucket existe
      const [bucketExists] = await this.bucket.exists();
      
      if (!bucketExists) {
        throw new Error(`Bucket ${this.bucketName} no existe`);
      }
      
      // Verificar permisos creando un archivo de prueba
      const testFileName = `${this.audioFolder}/test_${Date.now()}.txt`;
      const testFile = this.bucket.file(testFileName);
      
      await testFile.save('Test file from audio bot', {
        metadata: {
          contentType: 'text/plain'
        }
      });
      
      // Eliminar archivo de prueba
      await testFile.delete();
      
      return {
        success: true,
        message: 'Conexión exitosa con Google Cloud Storage',
        bucket: this.bucketName,
        folder: this.audioFolder
      };
      
    } catch (error) {
      console.error('❌ Error probando GCS:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Nuevo método para configurar permisos del bucket
  async configureBucketForPublicAccess() {
    try {
      console.log('🔧 Configurando bucket para acceso público...');
      
      // Verificar el estado actual del bucket
      const [metadata] = await this.bucket.getMetadata();
      
      if (metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled) {
        console.log('⚙️ Bucket tiene uniform bucket-level access habilitado');
        
        // Con uniform access, necesitamos usar IAM policies
        const [policy] = await this.bucket.iam.getPolicy();
        
        // Agregar política para hacer público el contenido
        policy.bindings.push({
          role: 'roles/storage.objectViewer',
          members: ['allUsers']
        });
        
        await this.bucket.iam.setPolicy(policy);
        console.log('✅ Política IAM configurada para acceso público');
        
        return {
          success: true,
          message: 'Bucket configurado para acceso público con IAM',
          uniformAccess: true
        };
      } else {
        console.log('⚙️ Bucket usa ACL tradicional');
        
        // Hacer público el bucket
        await this.bucket.makePublic();
        console.log('✅ Bucket configurado como público');
        
        return {
          success: true,
          message: 'Bucket configurado como público',
          uniformAccess: false
        };
      }
      
    } catch (error) {
      console.error('❌ Error configurando bucket:', error.message);
      return {
        success: false,
        error: error.message,
        suggestion: 'Configura manualmente el bucket como público en Google Cloud Console'
      };
    }
  }
}

module.exports = { GCSService };