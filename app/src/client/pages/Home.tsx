import { Link } from 'react-router-dom';

export default function Home() {
    
    
    return (
        <>
            <div className="flex flex-col h-screen items-center text-center justify-center">
                <h1>Song Parody AI </h1>
                <button className="border">
                    <Link to="/create-parody">
                        Create a New Song Parody
                    </Link>
                </button>

            </div>
        </>
    )
}