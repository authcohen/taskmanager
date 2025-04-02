import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Initialize Supabase with environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

// Create the Supabase client only if both URL and key are available
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client not initialized. Check environment variables." },
        { status: 500 },
      )
    }

    // Check if tables exist by trying to select from them
    const { data: usersData, error: usersError } = await supabase.from("users").select("id").limit(1)

    const { data: tasksData, error: tasksError } = await supabase.from("tasks").select("id").limit(1)

    // Try to insert a test user to check RLS permissions
    let rlsUserError = null
    let rlsTaskError = null

    if (!usersError) {
      // Only test RLS if the users table exists
      try {
        // Use a temporary user with a unique name for testing
        const testUsername = `test_${Date.now()}`
        const { error: insertError } = await supabase
          .from("users")
          .insert([{ username: testUsername, password_hash: "test_password" }])

        if (insertError) {
          rlsUserError = insertError
          console.log("RLS users test failed:", insertError)
        } else {
          // Clean up the test user
          await supabase.from("users").delete().eq("username", testUsername)
        }
      } catch (e) {
        rlsUserError = e
      }
    }

    // Test tasks table RLS
    if (!tasksError && !usersError) {
      try {
        // Get a user ID to test with
        const { data: testUser } = await supabase.from("users").select("id").limit(1).single()

        if (testUser) {
          const { error: insertTaskError } = await supabase.from("tasks").insert([
            {
              user_id: testUser.id,
              title: "Test task",
              completed: false,
            },
          ])

          if (insertTaskError) {
            rlsTaskError = insertTaskError
            console.log("RLS tasks test failed:", insertTaskError)
          } else {
            // Clean up the test task
            await supabase.from("tasks").delete().eq("title", "Test task")
          }
        }
      } catch (e) {
        rlsTaskError = e
      }
    }

    // Log the current state for debugging
    console.log("Database check results:", {
      usersExist: !usersError,
      tasksExist: !tasksError,
      rlsUserIssue: !!rlsUserError,
      rlsTaskIssue: !!rlsTaskError,
    })

    return NextResponse.json({
      success: true,
      message: "Database check complete",
      status: {
        usersTableExists: !usersError,
        tasksTableExists: !tasksError,
        rlsUserIssue: rlsUserError ? true : false,
        rlsTaskIssue: rlsTaskError ? true : false,
        rlsUserError: rlsUserError ? rlsUserError.message : null,
        rlsTaskError: rlsTaskError ? rlsTaskError.message : null,
        usersError: usersError ? usersError.message : null,
        tasksError: tasksError ? tasksError.message : null,
      },
      setupInstructions: `
        If tables don't exist, run these SQL commands in the Supabase SQL Editor:
        
        -- Create users table
        CREATE TABLE IF NOT EXISTS public.users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'User',
          supervisor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Create tasks table
        CREATE TABLE IF NOT EXISTS public.tasks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
          created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          completed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `,
      rlsInstructions: `
        -- Fix RLS (Row Level Security) issues
        
        -- IMPORTANT: Run this command to fix the tasks table RLS issue
        ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
        
        -- Alternative: If you want to keep RLS enabled with proper policies
        -- (More secure but requires more setup)
        
        -- For tasks table with RLS enabled
        ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
        
        -- Allow all operations on tasks
        CREATE POLICY "Allow all operations on tasks" ON public.tasks FOR ALL USING (true);
        
        -- For users table
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        
        -- Allow anyone to insert into users (for signup)
        CREATE POLICY "Allow public signup" ON public.users FOR INSERT WITH CHECK (true);
        
        -- Allow users to update and delete their own data
        CREATE POLICY "Users can manage their own data" ON public.users FOR ALL USING (true);
      `,
    })
  } catch (error: any) {
    console.error("Error checking database:", error)
    return NextResponse.json({ error: "Error checking database", details: error.message }, { status: 500 })
  }
}

