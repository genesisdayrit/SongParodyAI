import { Link } from 'react-router-dom';
import { Button } from "../components/ui/button"

export default function Home() {
    return (
        <div className="flex flex-col h-screen items-center text-center justify-center gap-4">
            <h1 className="text-4xl font-bold">Song Parody AI</h1>
            <Button className='border bg-black text-white hover:bg-black' asChild>
                <Link to="/create-parody">
                    Create a New Song Parody
                </Link>
            </Button>
        </div>
    )
}