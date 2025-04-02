"use client"

import { useEffect, useState } from "react"
import TaskManager from "@/components/task-manager"

export default function Home() {
  const [dbStatus, setDbStatus] = useState<{ success?: boolean; error?: string; status?: any } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkDatabase() {
      try {
        const response = await fetch("/api/setup-db")
        const data = await response.json()
        setDbStatus(data)
      } catch (error: any) {
        console.error("Error checking database:", error)
        setDbStatus({ error: error.message || "Failed to check database" })
      } finally {
        setIsLoading(false)
      }
    }

    checkDatabase()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking database setup...</p>
        </div>
      </div>
    )
  }

  if (dbStatus?.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow-md max-w-md w-full">
          <h1 className="text-xl font-bold text-red-600 mb-4">Setup Error</h1>
          <p className="text-gray-700 mb-4">
            There was an error checking the database. Please check your Supabase configuration.
          </p>
          <div className="bg-red-50 p-3 rounded text-sm text-red-800 font-mono overflow-auto">{dbStatus.error}</div>
        </div>
      </div>
    )
  }

  // If tables don't exist or there's an RLS issue, show setup instructions
  if (
    dbStatus?.status &&
    (!dbStatus.status.usersTableExists ||
      !dbStatus.status.tasksTableExists ||
      dbStatus.status.rlsUserIssue ||
      dbStatus.status.rlsTaskIssue)
  ) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow-md max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-amber-600 mb-4">Database Setup Required</h1>

          <div className="bg-gray-50 p-4 rounded border mb-4">
            <h2 className="font-bold mb-2">Database Status:</h2>
            <ul className="list-disc pl-5">
              <li className={dbStatus.status.usersTableExists ? "text-green-600" : "text-red-600"}>
                Users table: {dbStatus.status.usersTableExists ? "Exists" : "Missing"}
              </li>
              <li className={dbStatus.status.tasksTableExists ? "text-green-600" : "text-red-600"}>
                Tasks table: {dbStatus.status.tasksTableExists ? "Exists" : "Missing"}
              </li>
              {dbStatus.status.rlsUserIssue && (
                <li className="text-red-600">Users table RLS issue: {dbStatus.status.rlsUserError}</li>
              )}
              {dbStatus.status.rlsTaskIssue && (
                <li className="text-red-600">Tasks table RLS issue: {dbStatus.status.rlsTaskError}</li>
              )}
            </ul>
          </div>

          {(!dbStatus.status.usersTableExists || !dbStatus.status.tasksTableExists) && (
            <>
              <h2 className="font-bold text-lg mt-6 mb-2">Step 1: Create Tables</h2>
              <p className="text-gray-700 mb-2">
                Run these SQL commands in the Supabase SQL Editor to create the required tables:
              </p>
              <div className="bg-gray-800 text-gray-100 p-4 rounded font-mono text-sm overflow-auto">
                <pre>{dbStatus.setupInstructions}</pre>
              </div>
            </>
          )}

          {(dbStatus.status.rlsUserIssue || dbStatus.status.rlsTaskIssue) && (
            <>
              <h2 className="font-bold text-lg mt-6 mb-2">
                {!dbStatus.status.usersTableExists || !dbStatus.status.tasksTableExists
                  ? "Step 2: Fix Row Level Security"
                  : "Fix Row Level Security Issue"}
              </h2>
              <p className="text-gray-700 mb-2">
                Run these SQL commands in the Supabase SQL Editor to fix the Row Level Security issues:
              </p>
              <div className="bg-gray-800 text-gray-100 p-4 rounded font-mono text-sm overflow-auto">
                <pre>{dbStatus.rlsInstructions}</pre>
              </div>
            </>
          )}

          <div className="mt-6">
            <p className="text-gray-700">
              After running these commands in the Supabase SQL Editor, refresh this page to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main>
      <TaskManager />
    </main>
  )
}

