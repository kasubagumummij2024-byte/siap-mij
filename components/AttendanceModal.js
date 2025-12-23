import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';

export default function AttendanceModal({ visible, onClose, user, userData }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('myself'); 
  
  // State Absen Saya
  const [myStatus, setMyStatus] = useState(null); 
  const [selectedShift, setSelectedShift] = useState('Pagi'); 

  // State Kelola Tim
  const [teamList, setTeamList] = useState([]);

  const isLeader = ['kasubag', 'commander', 'koordinator'].includes(userData?.jabatan);
  const isSecurity = userData?.divisi === 'security';

  // --- REVISI: GENERATE TANGGAL LOKAL (FIX BUG ABSEN JAM 5 PAGI) ---
  // Jangan pakai new Date().toISOString() !
  const getLocalTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const todayDate = getLocalTodayDate(); 
  // ------------------------------------------------------------------

  // --- 1. LOAD DATA AWAL ---
  useEffect(() => {
    if (visible) {
      fetchMyAttendance();
      if (isLeader) fetchTeamAttendance();
    }
  }, [visible, activeTab]);

  const fetchMyAttendance = async () => {
    try {
      const docRef = doc(db, "attendance", `${todayDate}_${user.uid}`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setMyStatus(docSnap.data());
      } else {
        setMyStatus(null);
      }
    } catch (e) { console.error(e); }
  };

  const fetchTeamAttendance = async () => {
    try {
      setLoading(true);
      let qUsers;
      if (userData.jabatan === 'kasubag') {
        qUsers = query(collection(db, "users")); 
      } else {
        qUsers = query(collection(db, "users"), where("divisi", "==", userData.divisi)); 
      }
      const usersSnap = await getDocs(qUsers);
      
      const qAtt = query(collection(db, "attendance"), where("date", "==", todayDate));
      const attSnap = await getDocs(qAtt);
      const attendanceMap = {};
      attSnap.forEach(doc => {
        attendanceMap[doc.data().userId] = doc.data();
      });

      const list = [];
      usersSnap.forEach(u => {
        const uData = u.data();
        if (u.id !== user.uid) {
            list.push({
              id: u.id,
              nama: uData.nama,
              divisi: uData.divisi,
              jabatan: uData.jabatan,
              attendance: attendanceMap[u.id] || null 
            });
        }
      });
      setTeamList(list);

    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  // --- 2. FUNGSI ABSEN ---
  const handleSelfCheckIn = async () => {
    setLoading(true);
    try {
      const docId = `${todayDate}_${user.uid}`;
      const data = {
        userId: user.uid,
        userName: userData.nama,
        userDivisi: userData.divisi,
        date: todayDate, // Pastikan ini pakai variabel lokal yg sudah diperbaiki
        status: 'Hadir',
        shift: isSecurity ? selectedShift : 'Non-Shift', 
        timestamp: serverTimestamp(),
        updatedBy: 'Self'
      };

      await setDoc(doc(db, "attendance", docId), data);
      Alert.alert("Berhasil", "Absensi tercatat!");
      fetchMyAttendance();
    } catch (e) {
      Alert.alert("Gagal", "Error koneksi.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMember = async (memberId, memberName, memberDivisi, newStatus, shift = 'Non-Shift') => {
    try {
      const docId = `${todayDate}_${memberId}`;
      const data = {
        userId: memberId,
        userName: memberName,
        userDivisi: memberDivisi,
        date: todayDate, // Pastikan ini pakai variabel lokal yg sudah diperbaiki
        status: newStatus, 
        shift: memberDivisi === 'security' && newStatus === 'Hadir' ? shift : 'Non-Shift',
        timestamp: serverTimestamp(),
        updatedBy: userData.nama 
      };

      await setDoc(doc(db, "attendance", docId), data);
      setTeamList(prev => prev.map(item => 
        item.id === memberId ? { ...item, attendance: data } : item
      ));
    } catch (e) {
      Alert.alert("Error", "Gagal update status.");
    }
  };

  const promptSecurityShift = (member) => {
    Alert.alert(
      "Pilih Shift",
      `Tentukan shift untuk ${member.nama}:`,
      [
        { text: "Shift Pagi", onPress: () => handleUpdateMember(member.id, member.nama, member.divisi, 'Hadir', 'Pagi') },
        { text: "Shift Malam", onPress: () => handleUpdateMember(member.id, member.nama, member.divisi, 'Hadir', 'Malam') },
        { text: "Batal", style: 'cancel' }
      ]
    );
  };

  // --- RENDER UI ---

  const renderMyTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.dateText}>{new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
      
      {myStatus ? (
        <View style={[styles.statusBox, 
          { backgroundColor: myStatus.status === 'Hadir' ? '#dcfce7' : '#fee2e2' }
        ]}>
          <Ionicons name={myStatus.status === 'Hadir' ? "checkmark-circle" : "alert-circle"} size={50} 
            color={myStatus.status === 'Hadir' ? "#16a34a" : "#dc2626"} />
          <Text style={styles.statusBig}>{myStatus.status}</Text>
          {myStatus.shift !== 'Non-Shift' && <Text style={styles.shiftText}>({myStatus.shift})</Text>}
          <Text style={styles.timestamp}>Dicatat pada: {myStatus.timestamp ? new Date(myStatus.timestamp.toDate()).toLocaleTimeString() : '-'}</Text>
        </View>
      ) : (
        <View style={styles.formBox}>
          {isSecurity && (
            <View style={styles.shiftContainer}>
              <Text style={styles.label}>Pilih Shift:</Text>
              <View style={styles.shiftOptions}>
                <TouchableOpacity onPress={() => setSelectedShift('Pagi')} style={[styles.shiftBtn, selectedShift === 'Pagi' && styles.shiftBtnActive]}>
                  <Ionicons name="sunny" size={20} color={selectedShift === 'Pagi' ? 'white' : '#64748b'} />
                  <Text style={[styles.shiftTxt, selectedShift === 'Pagi' && {color:'white'}]}>Pagi</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedShift('Malam')} style={[styles.shiftBtn, selectedShift === 'Malam' && styles.shiftBtnActive]}>
                  <Ionicons name="moon" size={20} color={selectedShift === 'Malam' ? 'white' : '#64748b'} />
                  <Text style={[styles.shiftTxt, selectedShift === 'Malam' && {color:'white'}]}>Malam</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.bigCheckInBtn} onPress={handleSelfCheckIn} disabled={loading}>
            {loading ? <ActivityIndicator color="white"/> : (
              <>
                <Ionicons name="finger-print" size={40} color="white" />
                <Text style={styles.checkInText}>ABSEN MASUK</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderTeamTab = () => (
    <View style={{flex: 1}}>
       <FlatList
         data={teamList}
         keyExtractor={item => item.id}
         contentContainerStyle={{paddingBottom: 20}}
         renderItem={({ item }) => (
           <View style={styles.memberCard}>
             
             <View style={{ flex: 1, marginRight: 10 }}> 
               <Text style={styles.memberName}>{item.nama}</Text>
               <Text style={styles.memberRole}>{item.divisi.toUpperCase()}</Text>
               {item.attendance && (
                 <Text style={[styles.miniStatus, { color: item.attendance.status === 'Hadir' ? 'green' : 'red' }]}>
                   Status: {item.attendance.status} {item.attendance.shift !== 'Non-Shift' ? `(${item.attendance.shift})` : ''}
                 </Text>
               )}
             </View>
             
             <View style={{ maxWidth: '50%' }}> 
               <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingVertical: 5}}>
                 <View style={styles.actionRow}>
                   {/* Tombol Hadir */}
                   <TouchableOpacity 
                     style={[styles.actionBtn, {backgroundColor: '#dcfce7', borderColor:'#22c55e'}]}
                     onPress={() => item.divisi === 'security' ? promptSecurityShift(item) : handleUpdateMember(item.id, item.nama, item.divisi, 'Hadir')}
                   >
                     <Text style={{color:'#15803d', fontWeight:'bold'}}>H</Text>
                   </TouchableOpacity>

                   {/* Tombol Sakit */}
                   <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#fef9c3', borderColor:'#eab308'}]} onPress={() => handleUpdateMember(item.id, item.nama, item.divisi, 'Sakit')}>
                     <Text style={{color:'#a16207', fontWeight:'bold'}}>S</Text>
                   </TouchableOpacity>

                   {/* Tombol Izin */}
                   <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#e0f2fe', borderColor:'#0ea5e9'}]} onPress={() => handleUpdateMember(item.id, item.nama, item.divisi, 'Izin')}>
                     <Text style={{color:'#0369a1', fontWeight:'bold'}}>I</Text>
                   </TouchableOpacity>

                   {/* Tombol Alpha */}
                   <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#fee2e2', borderColor:'#ef4444'}]} onPress={() => handleUpdateMember(item.id, item.nama, item.divisi, 'Alpha')}>
                     <Text style={{color:'#b91c1c', fontWeight:'bold'}}>A</Text>
                   </TouchableOpacity>
                 </View>
               </ScrollView>
             </View>

           </View>
         )}
       />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={28} color="#334155" /></TouchableOpacity>
          <Text style={styles.title}>Absensi Harian</Text>
          <View style={{width:30}}/>
        </View>

        {isLeader && (
          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tabItem, activeTab === 'myself' && styles.tabActive]} onPress={() => setActiveTab('myself')}>
              <Text style={[styles.tabTxt, activeTab === 'myself' && styles.tabTxtActive]}>Absen Saya</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, activeTab === 'team' && styles.tabActive]} onPress={() => setActiveTab('team')}>
              <Text style={[styles.tabTxt, activeTab === 'team' && styles.tabTxtActive]}>Kelola Tim</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.content}>
          {activeTab === 'myself' ? renderMyTab() : renderTeamTab()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'white', elevation: 2 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  tabs: { flexDirection: 'row', padding: 10, backgroundColor: 'white' },
  tabItem: { flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#2563eb' },
  tabTxt: { color: '#64748b', fontWeight: 'bold' },
  tabTxtActive: { color: '#2563eb' },
  content: { flex: 1, padding: 20 },
  
  // Style Tab Saya
  dateText: { textAlign: 'center', color: '#64748b', marginBottom: 20, fontSize: 16 },
  statusBox: { alignItems: 'center', padding: 30, borderRadius: 20 },
  statusBig: { fontSize: 32, fontWeight: 'bold', color: '#1e293b', marginTop: 10 },
  shiftText: { fontSize: 18, color: '#475569', marginTop: 5 },
  timestamp: { marginTop: 20, color: '#64748b' },
  formBox: { backgroundColor: 'white', padding: 20, borderRadius: 15, elevation: 2 },
  shiftContainer: { marginBottom: 20 },
  label: { fontWeight: 'bold', marginBottom: 10 },
  shiftOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  shiftBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, marginHorizontal: 5 },
  shiftBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  shiftTxt: { marginLeft: 5, fontWeight: 'bold', color: '#64748b' },
  bigCheckInBtn: { backgroundColor: '#2563eb', padding: 20, borderRadius: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  checkInText: { color: 'white', fontWeight: 'bold', fontSize: 18, marginLeft: 10 },

  // Style Tab Team
  memberCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  memberName: { fontWeight: 'bold', color: '#1e293b' },
  memberRole: { fontSize: 10, color: '#64748b', fontWeight: 'bold' },
  miniStatus: { fontSize: 10, marginTop: 2, fontWeight: '600' },
  actionRow: { flexDirection: 'row' },
  actionBtn: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginLeft: 5 }
});