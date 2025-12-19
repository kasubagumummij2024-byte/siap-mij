import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function ApprovalList({ commanderData, commanderUid }) {
  const [requests, setRequests] = useState([]);

  // Dengar realtime permintaan izin dari anak buah satu divisi
  useEffect(() => {
    if (!commanderData?.divisi) return;

    const q = query(
      collection(db, "users"),
      where("divisi", "==", commanderData.divisi),
      where("status", "==", "pending") // Hanya yang statusnya Pending
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setRequests(list);
    });

    return () => unsubscribe();
  }, [commanderData]);

  // Fungsi saat Komandan klik TERIMA
  const handleApprove = async (member) => {
    Alert.alert("Konfirmasi", `Izinkan ${member.nama}?\nAnda akan tercatat MENGGANTIKAN tugas beliau.`, [
      { text: "Batal", style: "cancel" },
      { text: "ACC & GANTIKAN", onPress: async () => {
          try {
            // 1. Update Status Anggota (Mulai Timer)
            const memberRef = doc(db, "users", member.id);
            const now = new Date();
            let endTime = null;
            
            // Logika 40 Menit
            if (member.requestType === 'break') {
               endTime = new Date(now.getTime() + 40 * 60 * 1000); // 40 Menit dari SEKARANG
            }

            await updateDoc(memberRef, {
              status: member.requestType, // Jadi 'break' atau 'permit'
              statusEndTime: endTime ? Timestamp.fromDate(endTime) : null,
              statusReason: member.requestReason,
              approvedBy: commanderData.nama
            });

            // 2. Update Status Komandan (Jadi Pengganti)
            const commanderRef = doc(db, "users", commanderUid);
            await updateDoc(commanderRef, {
              status: 'replacing',
              replacingWho: member.nama,
              replacingReason: member.requestReason
            });

            Alert.alert("Berhasil", `Anda sekarang menggantikan ${member.nama}.`);

          } catch (e) {
            console.error(e);
            Alert.alert("Error", "Gagal memproses persetujuan.");
          }
      }}
    ]);
  };

  if (requests.length === 0) return null; // Sembunyikan jika tidak ada request

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔔 Permintaan Izin Masuk ({requests.length})</Text>
      {requests.map((req) => (
        <View key={req.id} style={styles.card}>
          <View style={{flex: 1}}>
            <Text style={styles.name}>{req.nama}</Text>
            <Text style={styles.reason}>{req.requestReason}</Text>
            <Text style={styles.type}>{req.requestType === 'break' ? 'Istirahat' : 'Izin Keluar'}</Text>
          </View>
          <TouchableOpacity style={styles.btnApprove} onPress={() => handleApprove(req)}>
            <Text style={styles.btnText}>ACC</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20, backgroundColor: '#fff7ed', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#fdba74' },
  title: { fontSize: 14, fontWeight: 'bold', color: '#c2410c', marginBottom: 10 },
  card: { flexDirection: 'row', backgroundColor: 'white', padding: 10, borderRadius: 8, marginBottom: 8, alignItems: 'center', elevation: 1 },
  name: { fontWeight: 'bold', fontSize: 14, color: '#334155' },
  reason: { fontSize: 12, color: '#64748b' },
  type: { fontSize: 10, color: '#f59e0b', fontWeight: 'bold', marginTop: 2 },
  btnApprove: { backgroundColor: '#22c55e', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 12 }
});