import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Initialize Supabase with environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

// Check if environment variables are defined
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
}

// Create the Supabase client only if both URL and key are available
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

// Get all users (for managers)
// Get users under a supervisor (for supervisors)
// Get available supervisors (for user assignment)
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
    const requestType = searchParams.get("type")
    const userId = searchParams.get("userId")

    // Get all available supervisors
    if (requestType === "supervisors") {
      const { data, error } = await supabase
        .from("users")
        .select("id, username")
        .in("role", ["Supervisor", "Manager"])

      if (error) throw error
      return NextResponse.json({ supervisors: data })
    }

    // If no userId provided for other requests, return error
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Get user role to check permission
    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single()

    if (userError) throw userError
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get users under a supervisor
    if (requestType === "supervised") {
      // Only supervisor and manager roles can access supervised users
      if (currentUser.role !== "Supervisor" && currentUser.role !== "Manager") {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      const { data, error } = await supabase
        .from("users")
        .select("id, username, role")
        .eq("supervisor_id", userId)

      if (error) throw error
      return NextResponse.json({ users: data })
    }

    // Get all users (managers only)
    if (requestType === "all") {
      if (currentUser.role !== "Manager") {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      const { data, error } = await supabase.from("users").select("id, username, role, supervisor_id")

      if (error) throw error
      return NextResponse.json({ users: data })
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
  } catch (error: any) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Error fetching users" }, { status: 500 })
  }
}

// Update user (change role, assign to supervisor)
export async function PUT(request: Request) {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    const { userId, targetUserId, role, supervisorId, managerId } = await request.json()

    if (!userId || !targetUserId) {
      return NextResponse.json({ error: "User ID and target user ID are required" }, { status: 400 })
    }

    // Check if manager has permission to update users
    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single()

    if (userError) throw userError
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Only managers can update user roles
    if (role && currentUser.role !== "Manager") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    // For supervisors, they can only manage users assigned to them
    if (currentUser.role === "Supervisor") {
      const { data: targetUser, error: targetError } = await supabase
        .from("users")
        .select("supervisor_id")
        .eq("id", targetUserId)
        .single()

      if (targetError) throw targetError
      if (!targetUser || targetUser.supervisor_id !== userId) {
        return NextResponse.json(
          { error: "You can only update users assigned to you" },
          { status: 403 },
        )
      }
    }

    // Prepare update data
    const updateData: any = {}
    if (role && currentUser.role === "Manager") {
      updateData.role = role
    }
    if (supervisorId !== undefined) {
      // If supervisor ID is empty string, set to null (remove supervisor)
      updateData.supervisor_id = supervisorId === "" ? null : supervisorId
    }

    // Update the user
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", targetUserId)
      .select("id, username, role, supervisor_id")
      .single()

    if (error) throw error
    return NextResponse.json({ user: data })
  } catch (error: any) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Error updating user" }, { status: 500 })
  }
} 