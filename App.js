import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Image } from 'react-native';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig'; // Pastikan file ini sudah diisi config asli
import { registerRootComponent } from 'expo';
import Dashboard from './components/Dashboard';

// --- HALAMAN LOGIN ---
export default function App() {
  const [user, setUser] = useState(null);       // Data Auth Firebase
  const [userData, setUserData] = useState(null); // Data Lengkap dari Database (Divisi, Nama)
  const [loading, setLoading] = useState(true);
  
  const [nip, setNip] = useState('');
  const [password, setPassword] = useState('');

  // 1. Cek Status Login Saat Aplikasi Dibuka (Auto Login)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Jika user terdeteksi login, ambil data detailnya dari Firestore
        await fetchUserProfile(currentUser);
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // 2. Fungsi Ambil Data Profil dari Firestore
  const fetchUserProfile = async (currentUser) => {
    try {
      const docRef = doc(db, "users", currentUser.uid); // Cari dokumen sesuai NIP (uid)
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        setUserData(docSnap.data()); // Simpan data nama, divisi, dll
      } else {
        console.log("User login, tapi data tidak ada di database users!");
      }
      setUser(currentUser);
    } catch (error) {
      console.error("Gagal ambil profil:", error);
      Alert.alert("Error", "Gagal mengambil data profil.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Fungsi Tombol Login
  const handleLogin = () => {
    if (!nip || !password) {
      Alert.alert("Mohon Maaf", "NIP dan Password wajib diisi.");
      return;
    }

    setLoading(true);
    // Ubah NIP jadi Email Dummy
    const emailDummy = `${nip}@siapmij.internal`;

    signInWithEmailAndPassword(auth, emailDummy, password)
      .catch((error) => {
        setLoading(false);
        console.error(error);
        Alert.alert("Gagal Masuk", "NIP atau Password salah.\nSilakan coba lagi.");
      });
  };

  // 4. Fungsi Logout
  const handleLogout = () => {
    Alert.alert("Konfirmasi", "Anda yakin ingin keluar?", [
      { text: "Batal", style: "cancel" },
      { text: "Ya, Keluar", onPress: () => { setLoading(true); signOut(auth); } }
    ]);
  };

  // --- TAMPILAN ---

  if (loading) {
    return (
      <View style={[styles.container, {justifyContent:'center'}]}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={{color:'white', marginTop:10, textAlign:'center'}}>Memuat Data...</Text>
      </View>
    );
  }

  // Jika sudah login, tampilkan Dashboard
  if (user && userData) {
    return <Dashboard user={user} userData={userData} onLogout={handleLogout} />;
  }

  // Jika belum login, tampilkan Form Login
  return (
    <View style={styles.container}>
      <View style={styles.logoArea}>
        <Text style={styles.logoTitle}>SIAP-MIJ</Text>
        <Text style={styles.logoSubtitle}>Sistem Integrasi Aktivitas & Pelaporan</Text>
        <Text style={styles.schoolName}>Madrasah Istiqlal Jakarta</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.labelDark}>Nomor Induk Pegawai (NIP)</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Contoh: 202501" 
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          value={nip}
          onChangeText={setNip}
        />

        <Text style={styles.labelDark}>Password</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Masukkan Password" 
          placeholderTextColor="#aaa"
          secureTextEntry 
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>MASUK APLIKASI</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.footer}>App v1.0 • Dev Mode</Text>
    </View>
  );
}

// --- STYLE (TAMPILAN) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e293b', // Navy Blue Elegant
    padding: 20,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
  },
  logoSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 5,
  },
  schoolName: {
    fontSize: 16,
    color: '#f59e0b', // Gold Color
    fontWeight: 'bold',
    marginTop: 5,
  },
  formCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 25,
    elevation: 5, // Shadow Android
    shadowColor: '#000', // Shadow iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  labelDark: {
    color: '#334155',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 20,
    color: '#0f172a'
  },
  loginButton: {
    backgroundColor: '#2563eb', // Bright Blue
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  footer: {
    textAlign: 'center',
    color: '#475569',
    marginTop: 40,
    fontSize: 12,
  },
  // Style untuk Home Sementara
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#22c55e', // Green Success
    textAlign: 'center',
    marginBottom: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 15,
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 10,
  },
  value: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
  }
});

registerRootComponent(App);