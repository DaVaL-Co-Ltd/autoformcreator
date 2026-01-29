import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing token/session logic here
        const savedUser = localStorage.getItem('daval_user');
        const savedToken = localStorage.getItem('daval_token');
        if (savedUser && savedToken) {
            setUser(JSON.parse(savedUser));
            axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
        }
        setLoading(false);
    }, []);

    const login = async (email, password, isLogin = true) => {
        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
        try {
            const response = await axios.post(endpoint, { email, password });
            const { user, token } = response.data;

            setUser(user);
            localStorage.setItem('daval_user', JSON.stringify(user));
            localStorage.setItem('daval_token', token);

            // Set default header footer future requests
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            return user;
        } catch (error) {
            console.error('Auth Error:', error);
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('daval_user');
        localStorage.removeItem('daval_token');
        delete axios.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
