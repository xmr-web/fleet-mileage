// ============================================================
// Supabase configuration and utilities
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://xlrtvtqwxyojhvzmsakz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_fqp4CKpbjxR5mfoHZvukBQ_fiE6C5Ge';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Vehicle operations
// ============================================================
export async function getVehicle(vehicleId) {
    const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', vehicleId)
        .single();
    
    if (error) throw error;
    return data;
}

export async function getAllVehicles() {
    const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('name');
    
    if (error) throw error;
    return data;
}

export async function updateVehicle(vehicleId, updates) {
    const { data, error } = await supabase
        .from('vehicles')
        .update(updates)
        .eq('id', vehicleId)
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

// ============================================================
// Mileage operations
// ============================================================
export async function addMileage(mileageData) {
    const { data, error } = await supabase
        .from('mileage')
        .insert([mileageData])
        .select();
    
    if (error) throw error;
    return data[0];
}

export async function getMileage(vehicleId, limit = 50) {
    const { data, error } = await supabase
        .from('mileage')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(limit);
    
    if (error) throw error;
    return data;
}

export async function getLatestMileage(vehicleId) {
    const { data, error } = await supabase
        .from('mileage')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    
    if (error) throw error;
    return data;
}

// ============================================================
// Fault report operations
// ============================================================
export async function addFaultReport(faultData) {
    const { data, error } = await supabase
        .from('fault_reports')
        .insert([faultData])
        .select();
    
    if (error) throw error;
    return data[0];
}

export async function getFaultReports(vehicleId, limit = 50) {
    const { data, error } = await supabase
        .from('fault_reports')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(limit);
    
    if (error) throw error;
    return data;
}

export async function getAllFaultReports(limit = 100) {
    const { data, error } = await supabase
        .from('fault_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    
    if (error) throw error;
    return data;
}

// ============================================================
// Known issues operations
// ============================================================
export async function getKnownIssues() {
    const { data, error } = await supabase
        .from('known_issues')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
}

// ============================================================
// Alert operations
// ============================================================
export async function getAlerts(vehicleId = null) {
    let query = supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function createAlert(alertData) {
    const { data, error } = await supabase
        .from('alerts')
        .insert([alertData])
        .select();
    
    if (error) throw error;
    return data[0];
}
