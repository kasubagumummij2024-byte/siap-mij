import { collection, doc, onSnapshot, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';

export default function ApprovalList({ commanderData, commanderUid }) {
  const [requests, setRequests] = useState([]);

  // --- LOGIKA HIERARKI PERSETUJUAN (REVISI POIN 1-6) ---
  useEffect(() => {
    if (!commanderData?.jabatan) return;

    // Ambil SEMUA user yang statusnya pending dulu
    // (Karena filter firestore terbatas untuk query 'OR' yang kompleks, kita filter manual di client)
    const q = query(
      collection(db, "users"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPending = [];
      snapshot.forEach((doc) => {
        allPending.push({ id: doc.id, ...doc.data() });
      });

      // FILTER BERDASARKAN JABATAN PENGGUNA YANG LOGIN (SAYA)
      const myJabatan = commanderData.jabatan; // Contoh: 'kasubag', 'commander', 'kabag_tu'
      const myDivisi = commanderData.divisi;   // Contoh: 'management', 'security'

      const filteredRequests = allPending.filter(applicant => {
        const appDiv = applicant.divisi; // Divisi pemohon
        const appJab = applicant.jabatan; // Jabatan pemohon

        // 1. KABAG TU (Poin 5)
        // Menyetujui: staf_tu, staf_umum, kasubag_umum, kasubag_logistik
        if (myJabatan === 'kabag_tu') {
            return ['staf_tu', 'staf_umum'].includes(appDiv) || 
                   ['kasubag_umum', 'kasubag_logistik'].includes(appJab);
        }

        // 2. KASUBAG UMUM (Poin 1, 2, 3, 6)
        // Menyetujui: cleaning, driver, maintenance, pantry (backup), security (backup), commander, koordinator
        if (myJabatan === 'kasubag_umum' || (myJabatan === 'kasubag' && myDivisi === 'umum')) { // Handle variasi penamaan
            if (['cleaning', 'driver', 'maintenance', 'pantry', 'security'].includes(appDiv)) return true;
            if (['commander', 'koordinator'].includes(appJab)) return true;
            return false;
        }

        // 3. KASUBAG LOGISTIK (Poin 4)
        // Menyetujui: staf_logistik, staf_perkap
        if (myJabatan === 'kasubag_logistik') {
            return ['staf_logistik', 'staf_perkap'].includes(appDiv);
        }

        // 4. COMMANDER (Poin 3)
        // Menyetujui: security
        if (myJabatan === 'commander') {
            return appDiv === 'security';
        }

        // 5. KOORDINATOR (Poin 2)
        // Menyetujui: pantry
        if (myJabatan === 'koordinator') {
            return appDiv === 'pantry';
        }

        return false;
      });

      setRequests(filteredRequests);
    });

    return () => unsubscribe();
  }, [commanderData]);

  // Fungsi saat Komandan klik TERIMA
  const handleApprove = async (member) => {
    // Pesan konfirmasi beda utk Security vs Staff Lain
    const isSecurityReq = member.divisi === 'security';
    const alertMsg = isSecurityReq 
        ? `Izinkan ${member.nama}?\nAnda akan tercatat MENGGANTIKAN (Backup) tugas beliau.`
        : `Izinkan ${member.nama} untuk ${member.requestType === 'break' ? 'Istirahat' : 'Keluar'}?`;

    Alert.alert("Konfirmasi", alertMsg, [
      { text: "Batal", style: "cancel" },
      { text: "ACC / SETUJUI", onPress: async () => {
          try {
            // 1. Update Status Anggota (Mulai Timer)
            const memberRef = doc(db, "users", member.id);
            const now = new Date();
            let endTime = null;
            
            // Logika 40 Menit (Hanya jika break)
            if (member.requestType === 'break') {
               endTime = new Date(now.getTime() + 40 * 60 * 1000); // 40 Menit
            }

            await updateDoc(memberRef, {
              status: member.requestType, // Jadi 'break' atau 'permit'
              statusEndTime: endTime ? Timestamp.fromDate(endTime) : null,
              statusReason: member.requestReason,
              approvedBy: commanderData.nama
            });

            // 2. KHUSUS SECURITY: Update Status Komandan (Jadi Pengganti)
            // (Poin 7: Backup hanya untuk Security -> Commander)
            if (isSecurityReq && commanderData.divisi === 'security') {
                const commanderRef = doc(db, "users", commanderUid);
                await updateDoc(commanderRef, {
                  status: 'replacing',
                  replacingWho: member.nama,
                  replacingReason: member.requestReason
                });
                Alert.alert("Berhasil", `Anda sekarang menggantikan ${member.nama}.`);
            } else {
                Alert.alert("Berhasil", `Izin untuk ${member.nama} telah disetujui.`);
            }

          } catch (e) {
            console.error(e);
            Alert.alert("Error", "Gagal memproses persetujuan.");
          }
      }}
    ]);
  };

  if (requests.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔔 Permintaan Izin Masuk ({requests.length})</Text>
      {requests.map((req) => (
        <View key={req.id} style={styles.card}>
          <View style={{flex: 1}}>
            <Text style={styles.name}>{req.nama}</Text>
            <Text style={styles.divisi}>{req.divisi.toUpperCase()}</Text>
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
  divisi: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold', marginBottom: 2 },
  reason: { fontSize: 12, color: '#64748b' },
  type: { fontSize: 10, color: '#f59e0b', fontWeight: 'bold', marginTop: 2 },
  btnApprove: { backgroundColor: '#22c55e', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 12 }
});