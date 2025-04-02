import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

// Initialize Supabase with environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

// Check if environment variables are defined
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
}

// Create the Supabase client only if both URL and key are available
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

export async function POST(request: Request) {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    const { username, password, isLogin, role, supervisorId } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    if (isLogin) {
      // Login flow
      const { data: user, error } = await supabase.from("users").select("*").eq("username", username).single()

      if (error || !user) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 })
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password_hash)
      if (!passwordMatch) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 })
      }

      // Don't send password hash to client
      const { password_hash, ...userWithoutPassword } = user
      return NextResponse.json({ user: userWithoutPassword })
    } else {
      // Signup flow
      // Check if user already exists
      const { data: existingUser } = await supabase.from("users").select("*").eq("username", username).single()

      if (existingUser) {
        return NextResponse.json({ error: "Username already exists" }, { status: 409 })
      }

      // Hash password
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(password, salt)

      // Prepare user data with default role if not provided
      const userData: any = {
        username,
        password_hash: hashedPassword,
        role: role || "User" // Default to User role if not specified
      }
      
      // Add supervisor_id if provided
      if (supervisorId) {
        // Verify the supervisor exists and is a Supervisor or Manager
        const { data: supervisor, error: supervisorError } = await supabase
          .from("users")
          .select("role")
          .eq("id", supervisorId)
          .single()
          
        if (supervisorError || !supervisor) {
          return NextResponse.json({ error: "Invalid supervisor ID" }, { status: 400 })
        }
        
        if (supervisor.role !== "Supervisor" && supervisor.role !== "Manager") {
          return NextResponse.json({ error: "Assigned supervisor must have Supervisor or Manager role" }, { status: 400 })
        }
        
        userData.supervisor_id = supervisorId
      }

      // Create new user
      const { data: newUser, error } = await supabase
        .from("users")
        .insert([userData])
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Error creating user" }, { status: 500 })
      }

      // Don't send password hash to client
      const { password_hash, ...userWithoutPassword } = newUser
      return NextResponse.json({ user: userWithoutPassword })
    }
  } catch (error) {
    console.error("Auth error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Add new endpoint to get users for supervisor assignment
export async function GET(request: Request) {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role")
    const userId = searchParams.get("userId")
    
    // If requesting supervisors, return all users with Supervisor role
    if (role === "supervisors") {
      const { data, error } = await supabase
        .from("users")
        .select("id, username")
        .in("role", ["Supervisor", "Manager"])
      
      if (error) {
        throw error
      }
      
      return NextResponse.json({ supervisors: data })
    }
    // If requesting supervised users for a supervisor
    else if (role === "supervised" && userId) {
      // First check if the user is a supervisor or manager
      const { data: currentUser, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single()
        
      if (userError) {
        throw userError
      }
      
      if (!currentUser || (currentUser.role !== "Supervisor" && currentUser.role !== "Manager")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
      
      // Get users supervised by this user
      const { data, error } = await supabase
        .from("users")
        .select("id, username, role")
        .eq("supervisor_id", userId)
        
      if (error) {
        throw error
      }
      
      return NextResponse.json({ users: data })
    }
    // If manager, can request all users
    else if (role === "all" && userId) {
      // First check if the user is a manager
      const { data: currentUser, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single()
        
      if (userError) {
        throw userError
      }
      
      if (!currentUser || currentUser.role !== "Manager") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
      
      // Get all users
      const { data, error } = await supabase
        .from("users")
        .select("id, username, role, supervisor_id")
        
      if (error) {
        throw error
      }
      
      return NextResponse.json({ users: data })
    }
    else {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Error fetching users" }, { status: 500 })
  }
}

