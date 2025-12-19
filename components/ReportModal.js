import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, ScrollView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, getDocs, addDoc, updateDoc, doc, increment, serverTimestamp, getDoc } from 'firebase/firestore'; // <-- Tambah getDoc
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';

export default function ReportModal({ visible, onClose, user, userData, onSuccess }) {
  const [image, setImage] = useState(null);
  const [desc, setDesc] = useState('');
  const [locationList, setLocationList] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocSelector, setShowLocSelector] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Ambil Data Lokasi
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "locations"));
        const locs = [];
        querySnapshot.forEach((doc) => {
          locs.push(doc.data());
        });
        setLocationList(locs);
      } catch (e) {
        console.error("Gagal ambil lokasi:", e);
      }
    };
    if (visible) fetchLocations();
  }, [visible]);

  // Fungsi Kamera
  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert("Izin Ditolak", "Mohon izinkan akses kamera.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.5,
      });
      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert("Error Kamera", error.message);
    }
  };

  // --- LOGIKA VALIDASI SHIFT (Security) ---
  const checkShiftValidity = async () => {
    // 1. Jika bukan Security, langsung lolos
    if (userData?.divisi !== 'security') return true;

    const now = new Date();
    const hour = now.getHours(); // Jam saat ini (0 - 23)
    const todayStr = now.toISOString().split('T')[0];

    try {
      // 2. Cek Absensi HARI INI
      const todayRef = doc(db, "attendance", `${todayStr}_${user.uid}`);
      const todaySnap = await getDoc(todayRef);
      
      let currentShift = todaySnap.exists() ? todaySnap.data().shift : null;

      // 3. SPECIAL CASE: JAM DINI HARI (00:00 - 07:00)
      // Jika sekarang jam 2 pagi, member mungkin belum absen hari ini,
      // tapi dia masih bertugas dari Shift Malam KEMARIN.
      if (!currentShift && hour >= 0 && hour <= 7) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        
        const yRef = doc(db, "attendance", `${yStr}_${user.uid}`);
        const ySnap = await getDoc(yRef);
        
        if (ySnap.exists() && ySnap.data().shift === 'Malam') {
          currentShift = 'Malam'; // Anggap dia masih shift malam
        }
      }

      // 4. Jika belum absen sama sekali
      if (!currentShift) {
        Alert.alert("Akses Ditolak", "Anda belum melakukan Absensi (Check-In) hari ini.");
        return false;
      }

      // 5. Validasi Jam vs Shift
      if (currentShift === 'Pagi') {
        // ATURAN PAGI: 05.00 - 19.00
        if (hour < 5 || hour >= 19) {
          Alert.alert("Diluar Jam Tugas", "Shift PAGI hanya bisa melapor antara jam 05:00 - 19:00.");
          return false;
        }
      } else if (currentShift === 'Malam') {
        // ATURAN MALAM: 17.00 - 07.00 (Besoknya)
        // Valid jika: Jam >= 17 (Sore/Malam ini) ATAU Jam <= 7 (Pagi buta besoknya)
        if (hour < 17 && hour > 7) {
          Alert.alert("Diluar Jam Tugas", "Shift MALAM hanya bisa melapor antara jam 17:00 - 07:00.");
          return false;
        }
      }

      return true; // Lolos semua cek

    } catch (error) {
      console.error("Error cek shift:", error);
      // Jika error internet/database, kita izinkan saja (fail-safe) atau blokir tergantung kebijakan
      return true; 
    }
  };

  // Fungsi Kirim
  const handleSubmit = async () => {
    // A. Validasi Input Dasar
    if (!image) { Alert.alert("Foto Wajib", "Harap ambil foto bukti."); return; }
    if (!selectedLocation) { Alert.alert("Lokasi Wajib", "Harap pilih lokasi."); return; }
    if (!desc) { Alert.alert("Keterangan Wajib", "Ceritakan aktivitas Anda."); return; }

    setUploading(true);

    // B. Validasi Shift Security (BARU)
    const isShiftValid = await checkShiftValidity();
    if (!isShiftValid) {
      setUploading(false);
      return; // Stop jika jam tidak sesuai shift
    }

    try {
      // C. Upload Foto
      const blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(xhr.response); };
        xhr.onerror = function (e) { reject(new TypeError("Network request failed")); };
        xhr.responseType = "blob";
        xhr.open("GET", image, true);
        xhr.send(null);
      });

      const filename = `laporan/${user.uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      blob.close();
      const downloadURL = await getDownloadURL(storageRef);

      // D. Simpan Database
      await addDoc(collection(db, "reports"), {
        userId: user.uid,
        userName: userData?.nama || user.displayName || "Anggota",
        userDivisi: userData?.divisi || "umum",
        locationId: selectedLocation.id,
        locationName: selectedLocation.nama,
        description: desc,
        photoUrl: downloadURL,
        timestamp: serverTimestamp(),
        date: new Date().toISOString().split('T')[0]
      });

      // E. Update Poin
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { total_poin: increment(10) });

      Alert.alert("Sukses!", "Laporan Terkirim. +10 Poin!");
      setImage(null);
      setDesc('');
      setSelectedLocation(null);
      onSuccess();
      
    } catch (error) {
      console.error(error);
      Alert.alert("Gagal", "Terjadi kesalahan sistem.");
    } finally {
      setUploading(false);
    }
  };

  const renderLocationPopup = () => (
    <Modal visible={showLocSelector} transparent={true} animationType="fade" onRequestClose={() => setShowLocSelector(false)}>
      <View style={styles.popupOverlay}>
        <View style={styles.popupContainer}>
          <Text style={styles.popupTitle}>Pilih Lokasi</Text>
          <FlatList 
            data={locationList}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 400 }} 
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.popupItem} onPress={() => { setSelectedLocation(item); setShowLocSelector(false); }}>
                <Ionicons name="location" size={20} color="#2563eb" style={{marginRight:10}} />
                <Text style={styles.popupItemText}>{item.nama}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={styles.closePopupBtn} onPress={() => setShowLocSelector(false)}>
            <Text style={{color:'#ef4444', fontWeight:'bold'}}>BATAL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {renderLocationPopup()}
        
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={28} color="#334155" /></TouchableOpacity>
          <Text style={styles.title}>Lapor Kegiatan</Text>
          <View style={{width:30}} />
        </View>

        <ScrollView style={styles.content}>
          <TouchableOpacity style={styles.photoArea} onPress={pickImage}>
            {image ? <Image source={{ uri: image }} style={styles.previewImage} /> : 
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={40} color="#2563eb" />
                <Text style={styles.uploadText}>Ambil Foto</Text>
              </View>
            }
          </TouchableOpacity>

          <Text style={styles.label}>Lokasi</Text>
          <TouchableOpacity style={styles.inputBox} onPress={() => setShowLocSelector(true)}>
            <Text style={{color: selectedLocation ? '#0f172a' : '#94a3b8'}}>{selectedLocation ? selectedLocation.nama : "Pilih Lokasi..."}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          </TouchableOpacity>

          <Text style={styles.label}>Keterangan</Text>
          <TextInput style={styles.textArea} placeholder="Ceritakan kegiatan..." multiline value={desc} onChangeText={setDesc} />
          
          <View style={{height: 100}}/>
        </ScrollView>

        <View style={styles.footer}>
          {uploading ? <ActivityIndicator size="large" color="#2563eb" /> : 
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitText}>KIRIM LAPORAN</Text>
            </TouchableOpacity>
          }
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#e2e8f0', backgroundColor: 'white' },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  photoArea: { height: 200, backgroundColor: '#eff6ff', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#bfdbfe', borderStyle: 'dashed' },
  previewImage: { width: '100%', height: '100%', borderRadius: 12 },
  uploadPlaceholder: { alignItems: 'center' },
  uploadText: { color: '#2563eb', marginTop: 10, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 10 },
  inputBox: { backgroundColor: 'white', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between' },
  textArea: { backgroundColor: 'white', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 15, height: 100, textAlignVertical: 'top' },
  footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#2563eb', padding: 15, borderRadius: 10, alignItems: 'center' },
  submitText: { color: 'white', fontWeight: 'bold' },
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  popupContainer: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '80%' },
  popupTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  popupItem: { padding: 15, borderBottomWidth: 1, borderColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center' },
  popupItemText: { marginLeft: 10, fontSize: 16 },
  closePopupBtn: { marginTop: 15, alignItems: 'center' }
});