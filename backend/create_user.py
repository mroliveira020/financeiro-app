import argparse
import getpass

from psycopg2 import errors

from models import criar_usuario


def parse_args():
    parser = argparse.ArgumentParser(
        description="Cria um usuário para o sistema Financeiro (armazenado no PostgreSQL)."
    )
    parser.add_argument("--email", help="E-mail do usuário (obrigatório)", required=True)
    parser.add_argument("--name", help="Nome do usuário (obrigatório)", required=True)
    parser.add_argument(
        "--role",
        choices=["admin", "prospector"],
        default="prospector",
        help="Papel do usuário (padrão: prospector)",
    )
    parser.add_argument(
        "--active",
        choices=["true", "false"],
        default="true",
        help="Define se o usuário será criado como ativo (padrão: true)",
    )
    parser.add_argument(
        "--password",
        help="Senha do usuário. Se omitida, será solicitada de forma segura (getpass).",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    password = args.password or getpass.getpass("Informe a senha: ")
    if not password:
        raise SystemExit("Senha obrigatória.")

    is_active = args.active.lower() == "true"

    try:
        user = criar_usuario(args.email, password, role=args.role, is_active=is_active, nome=args.name)
    except errors.UniqueViolation:
        raise SystemExit("E-mail já cadastrado.")
    except ValueError as exc:
        raise SystemExit(str(exc))
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Falha ao criar usuário: {exc}")

    print(
        f"Usuário criado com sucesso! ID={user['id']} | Nome={user['name']} | E-mail={user['email']} | Papel={user['role']} | Ativo={user['is_active']}"
    )


if __name__ == "__main__":
    main()
