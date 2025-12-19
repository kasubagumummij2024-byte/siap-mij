import React, { useState } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function PermissionModal({ visible, onClose, user, userData, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('break'); // 'break' (Istirahat) atau 'permit' (Izin Keluar)

  const handleSubmit = async () => {
    // Validasi input
    if (type === 'permit' && !reason) {
      Alert.alert("Wajib Isi", "Mohon tuliskan alasan izin keluar.");
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      
      // Update status menjadi PENDING (Menunggu Persetujuan)
      // Kita simpan detail requestnya agar Komandan bisa baca
      await updateDoc(userRef, {
        status: 'pending',          // Status gantung
        requestType: type,          // 'break' atau 'permit'
        requestReason: type === 'break' ? 'Istirahat Rutin (40 Menit)' : reason,
        requestTime: serverTimestamp()
      });
      
      Alert.alert("Permintaan Terkirim", "Mohon tunggu persetujuan Komandan/Koordinator.");
      onSuccess(); // Refresh Dashboard
      setReason('');
      onClose();

    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Gagal mengirim permintaan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Pengajuan Izin</Text>
          
          <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tab, type === 'break' && styles.activeTab]} onPress={() => setType('break')}>
              <Ionicons name="cafe" size={20} color={type === 'break' ? 'white' : '#64748b'} />
              <Text style={[styles.tabText, type === 'break' && styles.activeTabText]}>Istirahat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, type === 'permit' && styles.activeTab]} onPress={() => setType('permit')}>
              <Ionicons name="exit" size={20} color={type === 'permit' ? 'white' : '#64748b'} />
              <Text style={[styles.tabText, type === 'permit' && styles.activeTabText]}>Izin Keluar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {type === 'break' ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>⏳ Durasi: 40 Menit</Text>
                <Text style={styles.infoDesc}>
                  Waktu HANYA AKAN BERJALAN setelah Komandan memberikan persetujuan (ACC).
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Alasan Keperluan:</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Jelaskan alasan izin..." 
                  multiline 
                  value={reason}
                  onChangeText={setReason}
                />
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitText}>Ajukan Izin</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5 },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#1e293b' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 20 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 8 },
  activeTab: { backgroundColor: '#3b82f6' },
  tabText: { marginLeft: 8, fontWeight: '600', color: '#64748b' },
  activeTabText: { color: 'white' },
  content: { minHeight: 100 },
  infoBox: { backgroundColor: '#eff6ff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#dbeafe' },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e40af', marginBottom: 5 },
  infoDesc: { color: '#1e3a8a', fontSize: 13, lineHeight: 20 },
  label: { marginBottom: 8, fontWeight: 'bold', color: '#334155' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, height: 80, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  cancelBtn: { padding: 12 },
  cancelText: { color: '#64748b', fontWeight: 'bold' },
  submitBtn: { backgroundColor: '#3b82f6', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  submitText: { color: 'white', fontWeight: 'bold' }
});