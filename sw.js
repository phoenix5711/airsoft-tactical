// Service Worker pour PWA Airsoft Tactical
const CACHE_NAME = 'airsoft-tactical-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.23.0/firebase-app-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.23.0/firebase-database-compat.min.js'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interception des requêtes réseau
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retourner la réponse du cache si disponible
        if (response) {
          return response;
        }
        
        // Sinon, effectuer la requête réseau
        return fetch(event.request).then(response => {
          // Vérifier si la réponse est valide
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Cloner la réponse pour la mettre en cache
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Gestion de la synchronisation en arrière-plan
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Synchroniser les données en attente
      syncPendingData()
    );
  }
});

// Gestion des notifications push
self.addEventListener('push', event => {
  const options = {
    body: 'Nouvelle activité tactique détectée',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'airsoft-notification'
  };

  event.waitUntil(
    self.registration.showNotification('Airsoft Tactical', options)
  );
});

async function syncPendingData() {
  // Logique de synchronisation des données hors ligne
  try {
    // Récupérer les données en attente depuis IndexedDB
    // Envoyer à Firebase quand la connexion est rétablie
    console.log('Synchronisation des données en arrière-plan');
  } catch (error) {
    console.error('Erreur de synchronisation:', error);
  }
}

// ===== FONCTIONS CAPTEURS CORRIGÉES =====

toggleSensorMode() {
    this.state.sensorMode = !this.state.sensorMode;
    const btn = document.getElementById('sensorBtn');
    const panel = document.getElementById('sensorPanel');
    
    if (this.state.sensorMode) {
        // Désactiver les autres modes
        if (this.state.enemyMode) this.toggleEnemyMode();
        if (this.state.drawMode) this.toggleDrawMode();
        if (this.state.editMode) this.toggleEditMode();
        
        btn.classList.add('active');
        panel.classList.add('show');
        
        this.notify('📡 Panneau capteurs ouvert');
    } else {
        btn.classList.remove('active');
        panel.classList.remove('show');
        this.map.getContainer().style.cursor = '';
    }
},

addNewSensor() {
    console.log('Ajout nouveau capteur - Mode placement activé');
    
    // Fermer le panneau
    const panel = document.getElementById('sensorPanel');
    if (panel) panel.classList.remove('show');
    
    this.map.getContainer().style.cursor = 'crosshair';
    this.notify('📍 Cliquez sur la carte pour placer le capteur');
    
    // Handler pour le placement
    const placeSensorHandler = (e) => {
        console.log('Clic pour placement capteur à :', e.latlng);
        
        // Retirer le handler
        this.map.off('click', placeSensorHandler);
        this.map.getContainer().style.cursor = '';
        
        // Demander le nom du capteur
        const name = prompt('Nom du capteur (ex: SENSOR_01):', 'SENSOR_' + Date.now().toString().slice(-4));
        if (!name) {
            this.notify('Placement annulé');
            return;
        }
        
        const sensorData = {
            name: name,
            type: 'IR',
            status: 'active',
            position: {
                lat: e.latlng.lat,
                lng: e.latlng.lng
            },
            timestamp: Date.now(),
            placedBy: this.state.playerName,
            manual: true
        };
        
        console.log('Création capteur:', sensorData);
        
        // Sauvegarder dans Firebase
        if (this.state.isConnected && this.firebase.db) {
            const sensorRef = ref(this.firebase.db, 
                `sensors/${this.state.teamCode}/${name}`);
            set(sensorRef, sensorData).then(() => {
                console.log('Capteur sauvegardé dans Firebase');
                this.notify('📡 Capteur ajouté : ' + name);
                
                // Réouvrir le panneau
                const panel = document.getElementById('sensorPanel');
                if (panel) panel.classList.add('show');
            }).catch(err => {
                console.error('Erreur sauvegarde:', err);
                this.notify('❌ Erreur ajout capteur');
            });
        } else {
            // Mode hors ligne - créer localement
            this.state.sensors[name] = { data: sensorData };
            this.createSensorMarker(name, sensorData);
            this.notify('📡 Capteur ajouté localement');
        }
    };
    
    // Attacher le handler
    this.map.once('click', placeSensorHandler);
    
    // Timeout pour annuler
    setTimeout(() => {
        this.map.off('click', placeSensorHandler);
        this.map.getContainer().style.cursor = '';
    }, 30000);
},

updateSensors(data) {
    console.log('=== MISE À JOUR CAPTEURS ===', data);
    
    // Nettoyer les anciens marqueurs qui n'existent plus
    Object.keys(this.state.sensors).forEach(id => {
        if (!data || !data[id]) {
            if (this.state.sensors[id].marker) {
                this.map.removeLayer(this.state.sensors[id].marker);
            }
            delete this.state.sensors[id];
        }
    });
    
    if (!data) {
        console.log('Aucun capteur');
        this.updateSensorPanel();
        return;
    }
    
    // Mettre à jour ou créer les marqueurs
    Object.keys(data).forEach(id => {
        const sensor = data[id];
        
        // Vérifier que le capteur a une position (placé manuellement)
        if (!sensor.position || !sensor.position.lat || !sensor.position.lng) {
            console.log(`Capteur ${id} sans position - ignoré`);
            return;
        }
        
        // Créer ou mettre à jour
        if (!this.state.sensors[id]) {
            this.state.sensors[id] = { data: sensor };
            this.createSensorMarker(id, sensor);
        } else {
            // Mettre à jour l'état
            this.state.sensors[id].data = sensor;
            this.updateSensorMarker(id, sensor);
        }
    });
    
    // Mettre à jour le panneau
    this.updateSensorPanel();
    
    console.log(`${Object.keys(this.state.sensors).length} capteurs affichés`);
},

createSensorMarker(id, sensor) {
    if (!sensor.position) {
        console.error('Capteur sans position:', id);
        return;
    }
    
    const isTriggered = sensor.status === 'triggered' && 
                      Date.now() - sensor.timestamp < 30000; // 30 sec
    
    const icon = L.divIcon({
        className: 'sensor-marker-div',
        html: `<div class="sensor-marker ${isTriggered ? 'triggered' : ''}">
                   📡
               </div>
               <div style="background: rgba(0,0,0,0.8); color: ${isTriggered ? '#ff0000' : '#00ff00'}; 
                           padding: 2px 6px; border-radius: 4px; 
                           font-size: 10px; margin-top: 2px; font-weight: bold;">
                   ${sensor.name || id}
               </div>`,
        iconSize: [40, 50],
        iconAnchor: [20, 25]
    });
    
    const marker = L.marker([sensor.position.lat, sensor.position.lng], {
        icon,
        draggable: false
    }).addTo(this.map);
    
    // Popup de contrôle
    marker.bindPopup(`
        <div style="text-align: center; min-width: 150px;">
            <b>📡 ${sensor.name || id}</b><br>
            <small>Type: ${sensor.type || 'IR'}</small><br>
            <small>État: <span style="color: ${isTriggered ? '#ff0000' : '#00ff00'}; font-weight: bold;">
                ${isTriggered ? '🚨 DÉCLENCHÉ' : '✅ Actif'}
            </span></small><br>
            ${sensor.placedBy ? `<small>Placé par: ${sensor.placedBy}</small><br>` : ''}
            <div style="margin-top: 10px;">
                <button onclick="App.triggerSensor('${id}')" 
                    style="background: #00ff00; color: #000; 
                           border: none; padding: 5px 10px; 
                           border-radius: 3px; cursor: pointer; 
                           margin: 2px; font-size: 10px;">
                    🔔 Tester
                </button>
                <button onclick="App.removeSensor('${id}')" 
                    style="background: #ff4444; color: white; 
                           border: none; padding: 5px 10px; 
                           border-radius: 3px; cursor: pointer; 
                           margin: 2px; font-size: 10px;">
                    ❌ Retirer
                </button>
            </div>
        </div>
    `);
    
    this.state.sensors[id].marker = marker;
    console.log(`Marqueur capteur créé: ${id} à [${sensor.position.lat}, ${sensor.position.lng}]`);
},

updateSensorMarker(id, sensor) {
    const marker = this.state.sensors[id].marker;
    if (!marker) return;
    
    const isTriggered = sensor.status === 'triggered' && 
                      Date.now() - sensor.timestamp < 30000;
    
    // Mettre à jour l'icône
    const icon = L.divIcon({
        className: 'sensor-marker-div',
        html: `<div class="sensor-marker ${isTriggered ? 'triggered' : ''}">
                   📡
               </div>
               <div style="background: rgba(0,0,0,0.8); color: ${isTriggered ? '#ff0000' : '#00ff00'}; 
                           padding: 2px 6px; border-radius: 4px; 
                           font-size: 10px; margin-top: 2px; font-weight: bold;">
                   ${sensor.name || id}
               </div>`,
        iconSize: [40, 50],
        iconAnchor: [20, 25]
    });
    
    marker.setIcon(icon);
    
    // Alerte si déclenché (première fois seulement)
    if (isTriggered && !this.state.sensors[id].alerted) {
        this.state.sensors[id].alerted = true;
        this.notify(`🚨 Capteur ${sensor.name || id} déclenché!`);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        
        // Ouvrir popup automatiquement
        marker.openPopup();
        
        // Reset alerte après 30 sec
        setTimeout(() => {
            if (this.state.sensors[id]) {
                this.state.sensors[id].alerted = false;
            }
        }, 30000);
    }
},

updateSensorPanel() {
    const list = document.getElementById('sensorList');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (Object.keys(this.state.sensors).length === 0) {
        list.innerHTML = '<div style="color: #888; font-size: 11px; text-align: center; padding: 10px;">Aucun capteur</div>';
        return;
    }
    
    Object.keys(this.state.sensors).forEach(id => {
        const sensor = this.state.sensors[id].data;
        const isTriggered = sensor.status === 'triggered' && 
                          Date.now() - sensor.timestamp < 30000;
        
        const item = document.createElement('div');
        item.className = `sensor-item ${isTriggered ? 'triggered' : ''}`;
        item.innerHTML = `
            <span>${sensor.name || id}</span>
            <span style="font-size: 14px;">${isTriggered ? '🚨' : '✅'}</span>
        `;
        
        item.onclick = () => {
            const marker = this.state.sensors[id].marker;
            if (marker) {
                this.map.setView(marker.getLatLng(), 18);
                marker.openPopup();
            }
        };
        
        list.appendChild(item);
    });
},

triggerSensor(id) {
    console.log('Test capteur:', id);
    
    if (this.state.isConnected && this.firebase.db) {
        // Envoyer commande de test au capteur ESP32
        const cmdRef = ref(this.firebase.db, 
            `sensors/${this.state.teamCode}/${id}/command`);
        set(cmdRef, 'test');
        this.notify('📡 Test envoyé au capteur');
    } else {
        // Simulation locale
        if (this.state.sensors[id]) {
            this.state.sensors[id].data.status = 'triggered';
            this.state.sensors[id].data.timestamp = Date.now();
            this.updateSensorMarker(id, this.state.sensors[id].data);
            this.notify('📡 Test simulé');
        }
    }
},

removeSensor(id) {
    if (!confirm(`Supprimer le capteur ${id} ?`)) return;
    
    console.log('Suppression capteur:', id);
    
    if (this.state.isConnected && this.firebase.db) {
        const sensorRef = ref(this.firebase.db, 
            `sensors/${this.state.teamCode}/${id}`);
        remove(sensorRef).then(() => {
            this.notify('✅ Capteur supprimé');
        }).catch(err => {
            console.error('Erreur suppression:', err);
            this.notify('❌ Erreur suppression');
        });
    } else {
        // Suppression locale
        if (this.state.sensors[id] && this.state.sensors[id].marker) {
            this.map.removeLayer(this.state.sensors[id].marker);
        }
        delete this.state.sensors[id];
        this.updateSensorPanel();
        this.notify('✅ Capteur supprimé localement');
    }
    
    this.map.closePopup();
}
