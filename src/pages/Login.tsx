import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Hexagon, Lock, Mail, Shield } from 'lucide-react';
import { useStore } from '../store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';

export function Login() {
  const login = useStore(state => state.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@sentinel.ai');
  const [password, setPassword] = useState('password');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login({
      id: `usr-${Date.now()}`,
      name: 'Eleanor Vance',
      email,
      role: 'Admin'
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#f5f7f9]">
      {/* Decorative Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-200/40 rounded-full blur-[120px] pointer-events-none mix-blend-multiply" />
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-200/40 rounded-full blur-[100px] pointer-events-none mix-blend-multiply" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="inline-flex items-center justify-center mb-6 w-16 h-16 rounded-[1.25rem] bg-white shadow-xl shadow-blue-900/5 border border-gray-100 relative">
             <div className="absolute inset-0 rounded-[1.25rem] bg-gradient-to-br from-blue-50 to-white opacity-50"></div>
             <Hexagon className="w-8 h-8 text-blue-600 fill-blue-600/10" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Sentinel<span className="text-blue-600">BI</span></h1>
          <p className="text-gray-500 mt-2 font-medium">Enterprise AI Analytics & Governance</p>
        </div>

        <Card className="border-none soft-shadow-lg bg-white rounded-3xl overflow-hidden p-2">
          <CardHeader className="text-center pt-8 pb-4">
            <CardTitle className="text-2xl font-bold text-gray-900 tracking-tight">Sign in</CardTitle>
            <CardDescription className="text-gray-500 font-medium">Enter your credentials to access the platform</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-5 px-8 pt-4">
              <div className="space-y-2 relative group">
                <Mail className="absolute left-4 top-3.5 h-[18px] w-[18px] text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                <Input 
                  type="email" 
                  placeholder="Email" 
                  className="pl-11 bg-gray-50/50 border-gray-200 rounded-2xl h-14 text-[15px] shadow-none focus-visible:ring-1 focus-visible:ring-blue-200 focus-visible:border-blue-200 transition-all font-medium text-gray-900 placeholder:text-gray-400" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required 
                />
              </div>
              <div className="space-y-2 relative group">
                <Lock className="absolute left-4 top-3.5 h-[18px] w-[18px] text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                <Input 
                  type="password" 
                  placeholder="Password" 
                  className="pl-11 bg-gray-50/50 border-gray-200 rounded-2xl h-14 text-[15px] shadow-none focus-visible:ring-1 focus-visible:ring-blue-200 focus-visible:border-blue-200 transition-all font-medium text-gray-900 placeholder:text-gray-400" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required 
                />
              </div>
              
              <div className="flex items-center justify-between pt-1">
                 <div className="flex items-center text-[12px] font-semibold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                    <Shield className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                    SSO Enabled
                 </div>
                 <a href="#" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">Forgot password?</a>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 px-8 pb-8 pt-6">
              <Button type="submit" className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] shadow-md shadow-blue-600/20 transition-all">
                Sign In to Workspace
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
