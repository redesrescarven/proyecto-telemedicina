def mostrar_estructura():
    proyecto = "botonemergenciaapp"
    
    # Definición de la estructura lógica
    estructura = {
        "usuarios": {
            "tipo": "Colección",
            "descripcion": "Perfiles de usuarios y datos médicos",
            "campos": {
                "nombre_completo": "String",
                "telefono": "String (E.164)",
                "dni": "String",
                "grupo_sanguineo": "String",
                "fcm_token": "String (para notificaciones)",
                "fecha_registro": "Timestamp"
            },
            "subcolecciones": {
                "contactos_emergencia": {
                    "campos": {
                        "nombre": "String",
                        "parentesco": "String",
                        "telefono": "String"
                    }
                }
            }
        },
        "alertas": {
            "tipo": "Colección",
            "descripcion": "Registro de eventos de pánico activos e históricos",
            "campos": {
                "usuario_id": "Reference (-> usuarios/{id})",
                "estado": "String (activa | atendida | finalizada)",
                "tipo_emergencia": "String (seguridad | salud | incendio)",
                "ubicacion_lat": "Number",
                "ubicacion_lng": "Number",
                "timestamp_inicio": "Timestamp"
            },
            "subcolecciones": {
                "historial_ubicacion": {
                    "campos": {
                        "latitud": "Number",
                        "longitud": "Number",
                        "timestamp": "Timestamp"
                    }
                }
            }
        },
        "instituciones": {
            "tipo": "Colección",
            "descripcion": "Entidades de respuesta (Policía, Bomberos)",
            "campos": {
                "nombre_institucion": "String",
                "tipo": "String",
                "estado_servicio": "Boolean",
                "radio_cobertura_km": "Number"
            }
        }
    }

    print(f"{'='*50}")
    print(f"ESTRUCTURA DE BASE DE DATOS: {proyecto.upper()}")
    print(f"{'='*50}\n")

    for col, info in estructura.items():
        print(f"📂 [Colección] {col}")
        print(f"   📝 Descripción: {info['descripcion']}")
        print(f"   📍 Campos:")
        for campo, tipo in info['campos'].items():
            print(f"      ├── {campo}: <{tipo}>")
        
        if "subcolecciones" in info:
            for sub_col, sub_info in info['subcolecciones'].items():
                print(f"   └── 📂 [Subcolección] {sub_col}")
                for s_campo, s_tipo in sub_info['campos'].items():
                    print(f"          ├── {s_campo}: <{s_tipo}>")
        print("-" * 30)

if __name__ == "__main__":
    mostrar_estructura()

