"""Task Manager application logic."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
from rich.prompt import Prompt, IntPrompt, Confirm
from rich import box
import time


class Priority(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

    @property
    def color(self) -> str:
        return {
            Priority.LOW: "dim green",
            Priority.MEDIUM: "yellow",
            Priority.HIGH: "bold red",
            Priority.CRITICAL: "bold white on red",
        }[self]

    @property
    def icon(self) -> str:
        return {
            Priority.LOW: "[-]",
            Priority.MEDIUM: "[~]",
            Priority.HIGH: "[!]",
            Priority.CRITICAL: "[!!]",
        }[self]


@dataclass
class Task:
    id: int
    title: str
    description: str = ""
    priority: Priority = Priority.MEDIUM
    completed: bool = False
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    def complete(self) -> None:
        self.completed = True
        self.completed_at = datetime.now()


class TaskManager:
    """Interactive task manager with rich terminal UI."""

    def __init__(self) -> None:
        self.console = Console()
        self.tasks: list[Task] = []
        self._next_id = 1
        self._seed_sample_tasks()

    def _seed_sample_tasks(self) -> None:
        """Add sample tasks so the app feels alive on first launch."""
        samples = [
            ("Set up development environment", "Install dependencies and configure IDE", Priority.HIGH),
            ("Read project documentation", "Go through README and architecture docs", Priority.MEDIUM),
            ("Write unit tests", "Cover core logic with test cases", Priority.HIGH),
            ("Fix login page bug", "Users report 500 error on invalid email", Priority.CRITICAL),
            ("Update dependencies", "Run pip-audit and upgrade packages", Priority.LOW),
        ]
        for title, desc, prio in samples:
            self.tasks.append(Task(
                id=self._next_id,
                title=title,
                description=desc,
                priority=prio,
            ))
            self._next_id += 1

    def show_banner(self) -> None:
        banner_text = Text()
        banner_text.append("TASK ", style="bold cyan")
        banner_text.append("MANAGER", style="bold magenta")
        banner_text.append(" v1.0", style="dim")

        self.console.print()
        self.console.print(Panel(
            banner_text,
            subtitle="[dim]A beautiful CLI task manager built with Rich[/dim]",
            border_style="bright_blue",
            padding=(1, 4),
        ))

    def show_stats(self) -> None:
        total = len(self.tasks)
        done = sum(1 for t in self.tasks if t.completed)
        pending = total - done
        critical = sum(1 for t in self.tasks if not t.completed and t.priority == Priority.CRITICAL)

        stats = Table(show_header=False, box=None, padding=(0, 2))
        stats.add_column(justify="center")
        stats.add_column(justify="center")
        stats.add_column(justify="center")
        stats.add_column(justify="center")

        stats.add_row(
            f"[bold]{total}[/bold]\n[dim]Total[/dim]",
            f"[green]{done}[/green]\n[dim]Done[/dim]",
            f"[yellow]{pending}[/yellow]\n[dim]Pending[/dim]",
            f"[red]{critical}[/red]\n[dim]Critical[/dim]",
        )

        self.console.print(Panel(stats, title="[bold]Dashboard[/bold]", border_style="blue", padding=(1, 2)))

    def show_menu(self) -> str:
        menu = Table(show_header=False, box=None, padding=(0, 1))
        menu.add_column(style="bold cyan", justify="right", width=4)
        menu.add_column()

        menu.add_row("1.", "List all tasks")
        menu.add_row("2.", "Add new task")
        menu.add_row("3.", "Complete a task")
        menu.add_row("4.", "Delete a task")
        menu.add_row("5.", "Show statistics")
        menu.add_row("0.", "[dim]Exit[/dim]")

        self.console.print(Panel(menu, title="[bold]Menu[/bold]", border_style="green", padding=(1, 2)))

        return Prompt.ask(
            "[bold cyan]Choose an option[/bold cyan]",
            choices=["0", "1", "2", "3", "4", "5"],
            default="1",
        )

    def list_tasks(self) -> None:
        if not self.tasks:
            self.console.print("\n[dim italic]No tasks yet. Add one![/dim italic]\n")
            return

        table = Table(
            title="All Tasks",
            box=box.ROUNDED,
            border_style="bright_blue",
            header_style="bold white on blue",
            row_styles=["", "dim"],
        )

        table.add_column("ID", justify="center", width=4)
        table.add_column("Status", justify="center", width=8)
        table.add_column("Priority", justify="center", width=10)
        table.add_column("Title", min_width=25)
        table.add_column("Description", min_width=20, style="dim")
        table.add_column("Created", justify="center", width=12)

        for task in sorted(self.tasks, key=lambda t: (t.completed, list(Priority).index(t.priority))):
            status = "[green]Done[/green]" if task.completed else "[yellow]Pending[/yellow]"
            prio_text = f"[{task.priority.color}]{task.priority.icon} {task.priority.value.upper()}[/{task.priority.color}]"
            title = f"[strike dim]{task.title}[/strike dim]" if task.completed else task.title
            created = task.created_at.strftime("%b %d %H:%M")

            table.add_row(
                str(task.id),
                status,
                prio_text,
                title,
                task.description or "-",
                created,
            )

        self.console.print()
        self.console.print(table)
        self.console.print()

    def add_task(self) -> None:
        self.console.print("\n[bold cyan]--- New Task ---[/bold cyan]")

        title = Prompt.ask("[bold]Title[/bold]")
        if not title.strip():
            self.console.print("[red]Title cannot be empty.[/red]")
            return

        description = Prompt.ask("[bold]Description[/bold]", default="")

        priority_str = Prompt.ask(
            "[bold]Priority[/bold]",
            choices=["low", "medium", "high", "critical"],
            default="medium",
        )
        priority = Priority(priority_str)

        task = Task(
            id=self._next_id,
            title=title.strip(),
            description=description.strip(),
            priority=priority,
        )
        self.tasks.append(task)
        self._next_id += 1

        # Show a little progress animation
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            transient=True,
        ) as progress:
            add_task = progress.add_task("Adding task...", total=100)
            for _ in range(100):
                progress.update(add_task, advance=1)
                time.sleep(0.008)

        self.console.print(f"[green bold]Task #{task.id} added successfully![/green bold]\n")

    def complete_task(self) -> None:
        pending = [t for t in self.tasks if not t.completed]
        if not pending:
            self.console.print("\n[dim italic]No pending tasks.[/dim italic]\n")
            return

        self.console.print("\n[bold]Pending tasks:[/bold]")
        for t in pending:
            self.console.print(f"  [cyan]{t.id}[/cyan]. {t.title} [{t.priority.color}]{t.priority.value}[/{t.priority.color}]")

        task_id = IntPrompt.ask("\n[bold]Enter task ID to complete[/bold]")
        task = next((t for t in self.tasks if t.id == task_id and not t.completed), None)

        if task is None:
            self.console.print("[red]Task not found or already completed.[/red]\n")
            return

        task.complete()
        self.console.print(f"[green bold]Task #{task.id} '{task.title}' marked as done![/green bold]\n")

    def delete_task(self) -> None:
        if not self.tasks:
            self.console.print("\n[dim italic]No tasks to delete.[/dim italic]\n")
            return

        self.console.print("\n[bold]All tasks:[/bold]")
        for t in self.tasks:
            status = "[green]done[/green]" if t.completed else "[yellow]pending[/yellow]"
            self.console.print(f"  [cyan]{t.id}[/cyan]. {t.title} ({status})")

        task_id = IntPrompt.ask("\n[bold]Enter task ID to delete[/bold]")
        task = next((t for t in self.tasks if t.id == task_id), None)

        if task is None:
            self.console.print("[red]Task not found.[/red]\n")
            return

        if Confirm.ask(f"[bold red]Delete task '{task.title}'?[/bold red]"):
            self.tasks.remove(task)
            self.console.print(f"[red]Task #{task_id} deleted.[/red]\n")

    def run(self) -> None:
        """Main application loop."""
        self.show_banner()
        self.show_stats()

        while True:
            try:
                choice = self.show_menu()

                match choice:
                    case "1":
                        self.list_tasks()
                    case "2":
                        self.add_task()
                    case "3":
                        self.complete_task()
                    case "4":
                        self.delete_task()
                    case "5":
                        self.show_stats()
                    case "0":
                        self.console.print("\n[bold magenta]Goodbye![/bold magenta]\n")
                        break

            except KeyboardInterrupt:
                self.console.print("\n\n[bold magenta]Goodbye![/bold magenta]\n")
                break
