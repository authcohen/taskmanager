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
    const userId = searchParams.get("userId")
    const role = searchParams.get("role")
    const supervisorId = searchParams.get("supervisorId")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // If the user is a regular user, only return their tasks
    if (role === "User") {
      const { data, error } = await supabase.from("tasks").select("*").eq("user_id", userId)
      
      if (error) {
        throw error
      }
      
      return NextResponse.json({ tasks: data })
    } 
    // If the user is a supervisor, return tasks for all users under them
    else if (role === "Supervisor") {
      // Get all users under this supervisor
      const { data: supervisedUsers, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("supervisor_id", userId)
      
      if (userError) {
        throw userError
      }
      
      // If no supervised users, return empty array
      if (!supervisedUsers || supervisedUsers.length === 0) {
        return NextResponse.json({ tasks: [] })
      }
      
      // Get user ids of supervised users
      const supervisedUserIds = supervisedUsers.map((user: { id: string }) => user.id)
      
      // Get tasks for all supervised users
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("*, users:user_id(username, role)")
        .in("user_id", supervisedUserIds)
      
      if (tasksError) {
        throw tasksError
      }
      
      return NextResponse.json({ tasks })
    } 
    // If the user is a manager, they can see all tasks but we'll filter by supervisor if provided
    else if (role === "Manager") {
      let query = supabase.from("tasks").select("*, users:user_id(username, role, supervisor_id)")
      
      // If a specific supervisor ID is provided, only get tasks for users under that supervisor
      if (supervisorId) {
        const { data: supervisedUsers, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("supervisor_id", supervisorId)
        
        if (userError) {
          throw userError
        }
        
        // If no supervised users, return empty array
        if (!supervisedUsers || supervisedUsers.length === 0) {
          return NextResponse.json({ tasks: [] })
        }
        
        // Get user ids of supervised users
        const supervisedUserIds = supervisedUsers.map((user: { id: string }) => user.id)
        
        // Get tasks for all supervised users
        query = query.in("user_id", supervisedUserIds)
      }
      
      const { data, error } = await query
      
      if (error) {
        throw error
      }
      
      return NextResponse.json({ tasks: data })
    } else {
      // Default case for regular users
      const { data, error } = await supabase.from("tasks").select("*").eq("user_id", userId)
      
      if (error) {
        throw error
      }
      
      return NextResponse.json({ tasks: data })
    }
  } catch (error) {
    console.error("Error fetching tasks:", error)
    return NextResponse.json({ error: "Error fetching tasks" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    const { title, userId, createdBy, role, assignedUserId } = await request.json()

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    // Regular users can only create tasks for themselves
    if (role === "User") {
      if (!userId) {
        return NextResponse.json({ error: "User ID is required" }, { status: 400 })
      }

      const { data, error } = await supabase
        .from("tasks")
        .insert([{ title, user_id: userId, created_by: userId, completed: false }])
        .select()
        .single()

      if (error) {
        throw error
      }

      return NextResponse.json({ task: data })
    } 
    // Supervisors can create tasks for themselves or for users they supervise
    else if (role === "Supervisor" || role === "Manager") {
      // If no assigned user is provided, assign to self
      if (!assignedUserId) {
        const { data, error } = await supabase
          .from("tasks")
          .insert([{ title, user_id: userId, created_by: userId, completed: false }])
          .select()
  
        if (error) {
          throw error
        }
  
        return NextResponse.json({ task: data })
      }
      // Otherwise, assign to the specified user
      else {
        // For supervisors, verify they supervise this user
        if (role === "Supervisor") {
          const { data: user, error: userError } = await supabase
            .from("users")
            .select("supervisor_id")
            .eq("id", assignedUserId)
            .single()
  
          if (userError) {
            throw userError
          }
  
          if (!user || user.supervisor_id !== userId) {
            return NextResponse.json({ error: "You can only assign tasks to users you supervise" }, { status: 403 })
          }
        }
  
        const { data, error } = await supabase
          .from("tasks")
          .insert([{
            title,
            user_id: assignedUserId,
            created_by: userId,
            completed: false
          }])
          .select()
          .single()
  
        if (error) {
          throw error
        }
  
        return NextResponse.json({ task: data })
      }
    } else {
      // Default case - regular user
      if (!userId) {
        return NextResponse.json({ error: "User ID is required" }, { status: 400 })
      }

      const { data, error } = await supabase
        .from("tasks")
        .insert([{ title, user_id: userId, created_by: userId, completed: false }])
        .select()
        .single()

      if (error) {
        throw error
      }

      return NextResponse.json({ task: data })
    }
  } catch (error) {
    console.error("Error creating task:", error)
    return NextResponse.json({ error: "Error creating task" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    const { id, completed, role, userId } = await request.json()

    if (id === undefined) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
    }

    // First get the current task to check permissions
    const { data: task, error: fetchError } = await supabase.from("tasks").select("*").eq("id", id).single()

    if (fetchError) {
      throw fetchError
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Regular users can only update their own tasks
    if (role === "User" && task.user_id !== userId) {
      return NextResponse.json({ error: "You can only update your own tasks" }, { status: 403 })
    }

    // Supervisors can update tasks for users they supervise
    if (role === "Supervisor") {
      // Check if this user supervises the task owner
      const { data: taskOwner, error: userError } = await supabase
        .from("users")
        .select("supervisor_id")
        .eq("id", task.user_id)
        .single()

      if (userError) {
        throw userError
      }

      if (!taskOwner || taskOwner.supervisor_id !== userId) {
        return NextResponse.json({ error: "You can only update tasks for users you supervise" }, { status: 403 })
      }
    }

    // Prepare the update payload
    const updatePayload: any = {}
    
    if (completed !== undefined) {
      updatePayload.completed = completed
      
      // If marking as completed, set the completed_at timestamp
      if (completed) {
        updatePayload.completed_at = new Date().toISOString()
      } else {
        // If marking as not completed, clear the timestamp
        updatePayload.completed_at = null
      }
    }

    const { data, error } = await supabase.from("tasks").update(updatePayload).eq("id", id).select().single()

    if (error) {
      throw error
    }

    return NextResponse.json({ task: data })
  } catch (error) {
    console.error("Error updating task:", error)
    return NextResponse.json({ error: "Error updating task" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const userId = searchParams.get("userId")
    const role = searchParams.get("role")

    if (!id || !userId || !role) {
      return NextResponse.json({ error: "Task ID, User ID, and Role are required" }, { status: 400 })
    }

    // First get the current task to check permissions
    const { data: task, error: fetchError } = await supabase.from("tasks").select("*").eq("id", id).single()

    if (fetchError) {
      throw fetchError
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Regular users can only delete their own tasks
    if (role === "User" && task.user_id !== userId) {
      return NextResponse.json({ error: "You can only delete your own tasks" }, { status: 403 })
    }

    // Supervisors can delete tasks for users they supervise
    if (role === "Supervisor") {
      // Check if this user supervises the task owner
      const { data: taskOwner, error: userError } = await supabase
        .from("users")
        .select("supervisor_id")
        .eq("id", task.user_id)
        .single()

      if (userError) {
        throw userError
      }

      if (!taskOwner || taskOwner.supervisor_id !== userId) {
        return NextResponse.json({ error: "You can only delete tasks for users you supervise" }, { status: 403 })
      }
    }

    // Proceed with deletion (Managers can delete any task)
    const { error } = await supabase.from("tasks").delete().eq("id", id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting task:", error)
    return NextResponse.json({ error: "Error deleting task" }, { status: 500 })
  }
}

