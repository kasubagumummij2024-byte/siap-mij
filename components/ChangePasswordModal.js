import React, { useState } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { updatePassword } from 'firebase/auth';

export default function ChangePasswordModal({ visible, onClose, user }) {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Gagal", "Password minimal 6 karakter.");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(user, newPassword);
      Alert.alert("Sukses", "Password berhasil diubah! Silakan login ulang nanti.");
      setNewPassword('');
      onClose();
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert("Keamanan", "Untuk mengganti password, Anda harus Logout dan Login kembali terlebih dahulu.");
      } else {
        Alert.alert("Gagal", error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.title}>🔒 Ganti Password</Text>
          <Text style={styles.subtitle}>Masukkan password baru Anda</Text>

          <TextInput
            style={styles.input}
            placeholder="Password Baru (Min. 6 Karakter)"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Batal</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleChangePassword} style={styles.saveBtn} disabled={loading}>
              {loading ? <ActivityIndicator color="white"/> : <Text style={styles.saveText}>Simpan</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: 'white', borderRadius: 15, padding: 20, elevation: 5 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color: '#1e293b', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#64748b', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, marginBottom: 20 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { padding: 12, flex: 1, marginRight: 10, alignItems: 'center' },
  cancelText: { color: '#64748b', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#2563eb', padding: 12, borderRadius: 10, flex: 1, marginLeft: 10, alignItems: 'center' },
  saveText: { color: 'white', fontWeight: 'bold' }
});