"use client"

import React, { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Check, Trash, Plus, LogOut, LogIn, UserIcon, Users, ClipboardList, CalendarClock } from "lucide-react"
import { format } from "date-fns"

// Initialize Supabase - check if environment variables are available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create the Supabase client only if both URL and key are available
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

type Task = {
  id: string
  title: string
  completed: boolean
  user_id: string
  created_by: string
  completed_at?: string
  created_at: string
  users?: {
    username: string
    role: string
  }
}

type User = {
  id: string
  username: string
  role: string
  supervisor_id?: string
}

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState("")
  const [user, setUser] = useState<User | null>(null)
  const [auth, setAuth] = useState({
    username: "",
    password: "",
    isLogin: true,
    role: "User" as "User" | "Supervisor" | "Manager",
    supervisorId: ""
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [envError, setEnvError] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [taskError, setTaskError] = useState("")
  const [taskLoading, setTaskLoading] = useState(false)
  const [supervisors, setSupervisors] = useState<{id: string, username: string}[]>([])
  const [supervisedUsers, setSupervisedUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [activeTab, setActiveTab] = useState("my-tasks")

  // Auth Functions
  const handleAuth = async () => {
    if (!supabase) {
      setError("Supabase client not initialized")
      return
    }

    if (!auth.username || !auth.password) {
      setError("Please enter both username and password")
      return
    }

    setLoading(true)
    setError("")
    setDebugInfo(null)

    try {
      if (auth.isLogin) {
        // Login flow
        const { data, error } = await supabase.from("users").select().eq("username", auth.username).single()

        if (error) {
          console.error("Login error:", error)
          setDebugInfo({ type: "login_error", error })

          if (error.code === "PGRST116") {
            setError("User not found")
          } else {
            throw error
          }
          return
        }

        if (data) {
          // In a real app, never verify passwords on the client
          // This is just for demonstration purposes
          if (data.password_hash === auth.password) {
            setUser(data)
            localStorage.setItem("user", JSON.stringify(data))
            fetchTasks(data.id, data.role)
            
            // If user is a supervisor or manager, fetch their supervised users
            if (data.role === "Supervisor" || data.role === "Manager") {
              fetchSupervisedUsers(data.id)
            }
          } else {
            setError("Invalid password")
          }
        } else {
          setError("User not found")
        }
      } else {
        // For signup - let's log the process for debugging
        console.log("Starting signup process...")

        // Check if username already exists
        const { data: existingUser, error: checkError } = await supabase
          .from("users")
          .select("username")
          .eq("username", auth.username)
          .single()

        if (existingUser) {
          setError("Username already exists")
          return
        }

        // For signup
        const userData: any = {
          username: auth.username,
          password_hash: auth.password, // In a real app, hash this
          role: auth.role
        }
        
        // Add supervisor if selected
        if (auth.supervisorId) {
          userData.supervisor_id = auth.supervisorId
        }
        
        const { data, error } = await supabase
          .from("users")
          .insert([userData])
          .select()
          .single()

        if (error) {
          console.error("Signup error:", error)
          setDebugInfo({ type: "signup_error", error })

          if (error.code === "23505") {
            setError("Username already exists")
          } else if (error.message.includes("row-level security")) {
            setError("Database permission error. Please check RLS policies.")
          } else {
            setError(`Error creating account: ${error.message || error.details || JSON.stringify(error)}`)
          }
          throw error
        }

        if (data) {
          console.log("Signup successful:", data)
          setUser(data)
          localStorage.setItem("user", JSON.stringify(data))
          
          // If user is a supervisor or manager, initialize supervised users list
          if (data.role === "Supervisor" || data.role === "Manager") {
            setSupervisedUsers([])
          }
        } else {
          setError("No data returned after signup")
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err)
      if (!error) {
        setError(`An unexpected error occurred: ${err.message || JSON.stringify(err)}`)
      }
    } finally {
      setLoading(false)
    }
  }
  
  // Fetch available supervisors for signup
  const fetchSupervisors = async () => {
    if (!supabase) return
    
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username")
        .in("role", ["Supervisor", "Manager"])
        
      if (error) throw error
      
      setSupervisors(data || [])
    } catch (err) {
      console.error("Error fetching supervisors:", err)
    }
  }
  
  // Fetch users supervised by this supervisor or manager
  const fetchSupervisedUsers = async (userId: string) => {
    if (!supabase || !userId) return
    
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, role")
        .eq("supervisor_id", userId)
        
      if (error) throw error
      
      setSupervisedUsers(data || [])
    } catch (err) {
      console.error("Error fetching supervised users:", err)
    }
  }

  // Task Functions
  const fetchTasks = async (userId: string, role?: string) => {
    if (!supabase) {
      console.error("Supabase client not initialized")
      return
    }

    try {
      // If viewing a specific user's tasks as a supervisor or manager
      if (selectedUserId && (role === "Supervisor" || role === "Manager")) {
        const { data, error } = await supabase
          .from("tasks")
          .select("*, users:user_id(username, role)")
          .eq("user_id", selectedUserId)
        
        if (error) throw error
        setTasks(data || [])
        return
      }
      
      // If supervisor or manager viewing all tasks
      if ((role === "Supervisor" || role === "Manager") && activeTab === "team-tasks") {
        // For supervisor, get all tasks of supervised users
        const { data: supervisedUsers, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("supervisor_id", userId)
        
        if (userError) throw userError
        
        if (!supervisedUsers || supervisedUsers.length === 0) {
          setTasks([])
          return
        }
        
        const userIds = supervisedUsers.map((u: { id: string }) => u.id)
        
        const { data, error } = await supabase
          .from("tasks")
          .select("*, users:user_id(username, role)")
          .in("user_id", userIds)
        
        if (error) throw error
        setTasks(data || [])
        return
      }
      
      // Default: Get user's own tasks
      const { data, error } = await supabase
        .from("tasks")
        .select("*, users:created_by(username, role)")
        .eq("user_id", userId)

      if (error) {
        console.error("Error fetching tasks:", error)
        throw error
      }
      setTasks(data || [])
    } catch (err) {
      console.error("Error fetching tasks:", err)
    }
  }

  const addTask = async () => {
    if (!newTask.trim() || !user || !supabase) return

    setTaskError("")
    setTaskLoading(true)

    try {
      // First, check if we can access the tasks table
      const { error: checkError } = await supabase.from("tasks").select("id").limit(1)

      if (checkError) {
        console.error("Error checking tasks table:", checkError)
        setTaskError(`Cannot access tasks table: ${checkError.message}`)
        return
      }

      // If adding task for another user as supervisor/manager
      const taskUserId = (selectedUserId && activeTab === "team-tasks" && 
        (user.role === "Supervisor" || user.role === "Manager")) ? 
        selectedUserId : user.id
      
      const { data, error } = await supabase
        .from("tasks")
        .insert([
          {
            user_id: taskUserId,
            created_by: user.id,
            title: newTask,
            completed: false
          },
        ])
        .select()
        .single()

      if (error) {
        console.error("Error adding task:", error)

        if (error.message.includes("row-level security")) {
          setTaskError("Permission error: Please run the SQL commands to fix RLS for the tasks table")
          setDebugInfo({ type: "task_rls_error", error })
        } else {
          setTaskError(`Error adding task: ${error.message}`)
        }
        throw error
      }

      if (data) {
        console.log("Task added successfully:", data)
        setTasks([...tasks, data])
        setNewTask("")
      } else {
        setTaskError("No data returned after adding task")
      }
    } catch (err) {
      console.error("Error adding task:", err)
    } finally {
      setTaskLoading(false)
    }
  }

  const toggleTask = async (taskId: string) => {
    if (!supabase || !user) return

    const task = tasks.find((t: Task) => t.id === taskId)
    if (!task) return

    try {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          completed: !task.completed,
          completed_at: !task.completed ? new Date().toISOString() : null
        })
        .eq("id", taskId)
        .select()
        .single()

      if (error) throw error
      if (data) {
        setTasks(tasks.map((t: Task) => (t.id === taskId ? data : t)))
      }
    } catch (err) {
      console.error("Error toggling task:", err)
    }
  }

  const deleteTask = async (taskId: string) => {
    if (!supabase || !user) return

    try {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId)

      if (error) throw error
      setTasks(tasks.filter((t: Task) => t.id !== taskId))
    } catch (err) {
      console.error("Error deleting task:", err)
    }
  }

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("user")
    setUser(null)
    setTasks([])
    // Make sure we reset to login page
    setAuth((prev: typeof auth) => ({ ...prev, isLogin: true }))
  }
  
  // Handle user selection for supervisors/managers
  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId)
    if (user) {
      fetchTasks(user.id, user.role)
    }
  }
  
  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    // Reset selected user when switching tabs
    setSelectedUserId("")
    if (user) {
      fetchTasks(user.id, user.role)
    }
  }

  // Check for existing session
  useEffect(() => {
    // Check if Supabase client was initialized properly
    if (!supabase) {
      setEnvError(true)
      return
    }

    const savedUser = localStorage.getItem("user")
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser)
        setUser(userData)
        fetchTasks(userData.id, userData.role)
        
        // If user is a supervisor or manager, fetch their supervised users
        if (userData.role === "Supervisor" || userData.role === "Manager") {
          fetchSupervisedUsers(userData.id)
        }
      } catch (err) {
        console.error("Error parsing saved user:", err)
        localStorage.removeItem("user")
      }
    }
    
    // Fetch supervisors for signup
    if (!savedUser) {
      fetchSupervisors()
    }
  }, [])

  const tasksListItems = (tasks: Task[]) => tasks.map((task: Task) => (
    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center space-x-3">
        <button
          onClick={() => toggleTask(task.id)}
          className={`h-5 w-5 rounded flex items-center justify-center ${task.completed ? "bg-green-500 text-white" : "border border-gray-300"}`}
        >
          {task.completed && <Check className="h-3 w-3" />}
        </button>
        <div>
          <span className={task.completed ? "line-through text-gray-500" : ""}>{task.title}</span>
          {task.completed_at && (
            <div className="text-xs text-gray-500 flex items-center mt-1">
              <CalendarClock className="h-3 w-3 mr-1" />
              Completed: {format(new Date(task.completed_at), "MMM d, yyyy h:mm a")}
            </div>
          )}
          {task.users && task.created_by !== user?.id && (
            <div className="text-xs text-gray-500 mt-1">
              Assigned by: {task.users.username}
            </div>
          )}
        </div>
      </div>
      <button onClick={() => deleteTask(task.id)} className="text-gray-400 hover:text-red-500">
        <Trash className="h-4 w-4" />
      </button>
    </div>
  ))

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {envError ? (
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle>Configuration Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500 mb-4">Missing Supabase environment variables. Please make sure you've set up:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>NEXT_PUBLIC_SUPABASE_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            </ul>
            <p className="mt-4">Add these to your .env.local file or deployment environment variables.</p>
          </CardContent>
        </Card>
      ) : !user ? (
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle>{auth.isLogin ? "Login" : "Sign Up"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Username"
              value={auth.username}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuth({ ...auth, username: e.target.value })}
            />
            <Input
              type="password"
              placeholder="Password"
              value={auth.password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuth({ ...auth, password: e.target.value })}
            />
            
            {/* Additional signup fields */}
            {!auth.isLogin && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Role</label>
                  <Select 
                    value={auth.role} 
                    onValueChange={(value: string) => setAuth({ ...auth, role: value as "User" | "Supervisor" | "Manager" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="User">User</SelectItem>
                      <SelectItem value="Supervisor">Supervisor</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {auth.role === "User" && supervisors.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Assign to Supervisor (Optional)</label>
                    <Select 
                      value={auth.supervisorId} 
                      onValueChange={(value: string) => setAuth({ ...auth, supervisorId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Supervisor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {supervisors.map((supervisor: { id: string, username: string }) => (
                          <SelectItem key={supervisor.id} value={supervisor.id}>
                            {supervisor.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            
            {error && <p className="text-sm text-red-500">{error}</p>}
            {debugInfo && (
              <div className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                <p className="font-bold">Debug Info:</p>
                <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
              </div>
            )}
            <Button onClick={handleAuth} className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <>
                  {auth.isLogin ? <LogIn className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {auth.isLogin ? "Login" : "Sign Up"}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAuth({ 
                  ...auth, 
                  isLogin: !auth.isLogin,
                  role: "User",
                  supervisorId: ""
                })
                setError("")
                setDebugInfo(null)
              }}
              className="w-full"
            >
              {auth.isLogin ? "Need an account? Sign up" : "Already have an account? Login"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-4xl mx-auto">
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle>Task Management</CardTitle>
              <CardDescription className="mt-2">
                Logged in as <span className="font-medium">{user.username}</span> 
                <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 text-xs rounded-full">
                  {user.role}
                </span>
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Role-based tabs */}
            {(user.role === "Supervisor" || user.role === "Manager") ? (
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="my-tasks" className="flex items-center">
                    <UserIcon className="w-4 h-4 mr-2" /> My Tasks
                  </TabsTrigger>
                  <TabsTrigger value="team-tasks" className="flex items-center">
                    <Users className="w-4 h-4 mr-2" /> Team Tasks
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="my-tasks">
                  {/* Personal tasks view - similar to regular user view */}
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newTask}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTask(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && !taskLoading && addTask()}
                        placeholder="Add a new task..."
                        disabled={taskLoading}
                      />
                      <Button onClick={addTask} disabled={taskLoading}>
                        {taskLoading ? (
                          <svg
                            className="animate-spin h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        ) : (
                          <>
                            <Plus className="mr-2 h-4 w-4" /> Add
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {taskError && (
                      <div className="text-sm text-red-500 p-2 bg-red-50 rounded">
                        <p className="font-semibold">Error:</p>
                        <p>{taskError}</p>
                        {debugInfo?.type === "task_rls_error" && (
                          <p className="mt-2 text-xs">
                            Please go to your Supabase SQL Editor and run:
                            <code className="block bg-gray-800 text-white p-2 mt-1 rounded">
                              ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
                            </code>
                          </p>
                        )}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {tasks.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">No tasks yet. Add one to get started!</p>
                      ) : (
                        tasksListItems(tasks)
                      )}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="team-tasks">
                  {/* Team tasks - view for supervisors and managers */}
                  <div className="space-y-4">
                    {supervisedUsers.length === 0 ? (
                      <div className="bg-yellow-50 p-4 rounded border border-yellow-200">
                        <p className="text-yellow-800">
                          You don't have any team members assigned to you yet.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center space-x-2">
                          <div className="flex-1">
                            <Select value={selectedUserId} onValueChange={handleUserSelect}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select team member" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">All team members</SelectItem>
                                {supervisedUsers.map((member: User) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    {member.username} ({member.role})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {selectedUserId && (
                            <>
                              <Input
                                value={newTask}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTask(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && !taskLoading && addTask()}
                                placeholder="Assign a new task..."
                                disabled={taskLoading}
                              />
                              <Button onClick={addTask} disabled={taskLoading}>
                                <Plus className="mr-2 h-4 w-4" /> Assign
                              </Button>
                            </>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          {tasks.length === 0 ? (
                            <p className="text-center text-gray-500 py-4">
                              {selectedUserId ? 
                                "This team member has no tasks yet." : 
                                "No tasks found for your team members."}
                            </p>
                          ) : (
                            tasksListItems(tasks)
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              // Regular user view
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newTask}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTask(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && !taskLoading && addTask()}
                    placeholder="Add a new task..."
                    disabled={taskLoading}
                  />
                  <Button onClick={addTask} disabled={taskLoading}>
                    {taskLoading ? (
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" /> Add
                      </>
                    )}
                  </Button>
                </div>
                {taskError && (
                  <div className="text-sm text-red-500 p-2 bg-red-50 rounded">
                    <p className="font-semibold">Error:</p>
                    <p>{taskError}</p>
                    {debugInfo?.type === "task_rls_error" && (
                      <p className="mt-2 text-xs">
                        Please go to your Supabase SQL Editor and run:
                        <code className="block bg-gray-800 text-white p-2 mt-1 rounded">
                          ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
                        </code>
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No tasks yet. Add one to get started!</p>
                  ) : (
                    tasksListItems(tasks)
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

