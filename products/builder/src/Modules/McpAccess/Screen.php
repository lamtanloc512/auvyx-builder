<?php
/**
 * Auvyx Builder → AI connections: make a connection (its token is shown once), see and revoke them, read what they did,
 * and copy a ready config for Claude Code, Claude Desktop, Cursor or an HTTP MCP client. Administrators only.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\McpAccess;

defined( 'ABSPATH' ) || exit;

final class Screen {

	public const SLUG = '-ai';

	/** The npm package the configs run. */
	public const PACKAGE = '@auvyx/mcp';

	/**
	 * @param array<string, mixed> $tabs Tabs added so far.
	 * @return array<string, mixed>
	 */
	public function tab( $tabs ) {
		$tabs               = (array) $tabs;
		$tabs[ self::SLUG ] = array(
			__( 'AI connections', 'auvyx-builder' ),
			'manage_options',
			array( $this, 'render' ),
			__( 'Let Claude, Cursor or another AI build pages on this site through MCP, with a token you can limit and revoke.', 'auvyx-builder' ),
		);
		return $tabs;
	}

	/**
	 * Handles this screen's forms. Answers the new token string (shown once, never kept) or a message.
	 *
	 * @return array{token?: string, record?: array<string, mixed>, notice?: string, error?: string}
	 */
	public static function handle(): array {
		if ( ! current_user_can( 'manage_options' ) || ! isset( $_POST['auvyx_mcp_action'] ) ) {
			return array();
		}
		$action = sanitize_key( wp_unslash( $_POST['auvyx_mcp_action'] ) );
		if ( 'create' === $action ) {
			check_admin_referer( 'auvyx-mcp-create' );
			$scopes = isset( $_POST['auvyx_mcp_scopes'] ) && is_array( $_POST['auvyx_mcp_scopes'] ) ? array_map( 'sanitize_key', wp_unslash( $_POST['auvyx_mcp_scopes'] ) ) : array();
			$made   = Tokens::create(
				isset( $_POST['auvyx_mcp_name'] ) ? sanitize_text_field( wp_unslash( $_POST['auvyx_mcp_name'] ) ) : '',
				$scopes,
				isset( $_POST['auvyx_mcp_days'] ) ? absint( $_POST['auvyx_mcp_days'] ) : Tokens::DEFAULT,
				get_current_user_id()
			);
			return is_wp_error( $made ) ? array( 'error' => $made->get_error_message() ) : $made;
		}
		if ( 'revoke' === $action && isset( $_POST['auvyx_mcp_id'] ) ) {
			$id = sanitize_key( wp_unslash( $_POST['auvyx_mcp_id'] ) );
			check_admin_referer( 'auvyx-mcp-revoke-' . $id );
			return Tokens::revoke( $id ) ? array( 'notice' => __( 'Connection revoked. Its token no longer works.', 'auvyx-builder' ) ) : array();
		}
		return array();
	}

	/**
	 * The client configs, for a token (or a placeholder).
	 *
	 * @return array<string, string> label => text
	 */
	public static function configs( string $token ): array {
		$site  = untrailingslashit( home_url( '/' ) );
		$env   = array(
			'AUVYX_SITE'  => $site,
			'AUVYX_TOKEN' => $token,
		);
		$json  = static function ( $servers ) {
			return (string) wp_json_encode( array( 'mcpServers' => $servers ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		};
		$stdio = array(
			'auvyx' => array(
				'command' => 'npx',
				'args'    => array( '-y', self::PACKAGE ),
				'env'     => $env,
			),
		);
		return array(
			__( 'Claude Code (terminal)', 'auvyx-builder' )            => 'claude mcp add auvyx -e AUVYX_SITE=' . $site . ' -e AUVYX_TOKEN=' . $token . ' -- npx -y ' . self::PACKAGE,
			__( 'Claude Desktop (claude_desktop_config.json)', 'auvyx-builder' ) => $json( $stdio ),
			__( 'Cursor (.cursor/mcp.json)', 'auvyx-builder' )          => $json( $stdio ),
			__( 'HTTP (one server for several clients)', 'auvyx-builder' ) => 'AUVYX_SITE=' . $site . ' npx -y ' . self::PACKAGE . " --http 8787\n"
				. 'claude mcp add --transport http auvyx http://127.0.0.1:8787/mcp --header "Authorization: Bearer ' . $token . '"',
		);
	}

	private static function when( int $time ): string {
		return $time > 0 ? wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $time ) : '—';
	}

	private static function user_name( int $id ): string {
		$user = get_userdata( $id );
		return $user ? $user->display_name : '#' . $id;
	}

	public function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$result = self::handle();
		if ( isset( $result['error'] ) ) {
			echo '<div class="notice notice-error inline"><p>' . esc_html( $result['error'] ) . '</p></div>';
		}
		if ( isset( $result['notice'] ) ) {
			echo '<div class="notice notice-success inline"><p>' . esc_html( $result['notice'] ) . '</p></div>';
		}
		if ( isset( $result['token'] ) ) {
			echo '<section class="auvyx-card"><h2>' . esc_html__( 'Your new connection', 'auvyx-builder' ) . '</h2>';
			echo '<p><strong>' . esc_html__( 'Copy the token now: it is shown only once and cannot be recovered.', 'auvyx-builder' ) . '</strong></p>';
			echo '<p><input type="text" class="large-text code" readonly onfocus="this.select()" value="' . esc_attr( $result['token'] ) . '" aria-label="' . esc_attr__( 'Token', 'auvyx-builder' ) . '"></p>';
			self::print_configs( $result['token'] );
			echo '</section>';
		}
		$this->print_form();
		$this->print_list();
		if ( ! isset( $result['token'] ) ) {
			echo '<section class="auvyx-card"><h2>' . esc_html__( 'Connect a client', 'auvyx-builder' ) . '</h2><p class="auvyx-muted">' . esc_html__( 'Put your connection\'s token in place of auvyxmcp_… (it is shown when you create the connection).', 'auvyx-builder' ) . '</p>';
			self::print_configs( 'auvyxmcp_…' );
			echo '</section>';
		}
		$this->print_audit();
	}

	private static function print_configs( string $token ): void {
		foreach ( self::configs( $token ) as $label => $text ) {
			echo '<h3>' . esc_html( $label ) . '</h3><textarea class="large-text code" readonly rows="' . esc_attr( (string) min( 14, substr_count( $text, "\n" ) + 2 ) ) . '" onfocus="this.select()">' . esc_textarea( $text ) . '</textarea>';
		}
	}

	private function print_form(): void {
		$grantable = Tokens::grantable( get_current_user_id() );
		$about     = array(
			'read'    => __( 'Read: site, pages, media, revisions (always)', 'auvyx-builder' ),
			'draft'   => __( 'Draft: create pages and save drafts, upload media', 'auvyx-builder' ),
			'publish' => __( 'Publish: publish pages, set the front page, change the design', 'auvyx-builder' ),
			'code'    => __( 'Code: save code elements and custom CSS (otherwise they wait for your approval)', 'auvyx-builder' ),
			'delete'  => __( 'Delete: move pages to the trash (never deleted for good)', 'auvyx-builder' ),
		);
		echo '<section class="auvyx-card"><h2>' . esc_html__( 'New connection', 'auvyx-builder' ) . '</h2><form method="post">';
		wp_nonce_field( 'auvyx-mcp-create' );
		echo '<input type="hidden" name="auvyx_mcp_action" value="create">';
		echo '<p><label>' . esc_html__( 'Name', 'auvyx-builder' ) . '<br><input type="text" name="auvyx_mcp_name" class="regular-text" maxlength="80" required placeholder="' . esc_attr__( 'Claude on my laptop', 'auvyx-builder' ) . '"></label></p>';
		echo '<fieldset><legend>' . esc_html__( 'What it may do', 'auvyx-builder' ) . '</legend>';
		foreach ( Tokens::SCOPES as $scope ) {
			$can = in_array( $scope, $grantable, true );
			printf(
				'<label style="display:block"><input type="checkbox" name="auvyx_mcp_scopes[]" value="%1$s"%2$s%3$s> %4$s</label>',
				esc_attr( $scope ),
				'read' === $scope || 'draft' === $scope ? ' checked' : '',
				'read' === $scope || ! $can ? ' disabled' : '',
				esc_html( $about[ $scope ] )
			);
		}
		echo '</fieldset><p><label>' . esc_html__( 'Expires after', 'auvyx-builder' ) . ' <select name="auvyx_mcp_days">';
		foreach ( Tokens::EXPIRY as $days ) {
			/* translators: %d: number of days */
			printf( '<option value="%1$d"%2$s>%3$s</option>', (int) $days, Tokens::DEFAULT === $days ? ' selected' : '', esc_html( sprintf( _n( '%d day', '%d days', $days, 'auvyx-builder' ), $days ) ) );
		}
		echo '</select></label></p><p><button type="submit" class="button button-primary">' . esc_html__( 'Create connection', 'auvyx-builder' ) . '</button></p></form></section>';
	}

	private function print_list(): void {
		$tokens = array_reverse( Tokens::all() );
		echo '<section class="auvyx-card auvyx-card--flush">';
		if ( array() === $tokens ) {
			echo '<div class="auvyx-empty"><strong>' . esc_html__( 'No AI connections yet', 'auvyx-builder' ) . '</strong><p>' . esc_html__( 'Create one above, then paste its config into your AI client.', 'auvyx-builder' ) . '</p></div></section>';
			return;
		}
		echo '<table class="auvyx-table"><thead><tr><th>' . esc_html__( 'Name', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Acts as', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Scopes', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Created', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Last used', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Expires', 'auvyx-builder' ) . '</th><th><span class="screen-reader-text">' . esc_html__( 'Actions', 'auvyx-builder' ) . '</span></th></tr></thead><tbody>';
		foreach ( $tokens as $t ) {
			$id      = (string) $t['id'];
			$revoked = ! empty( $t['revoked'] );
			$expired = (int) $t['expires'] < time();
			echo '<tr><td><span class="auvyx-table__title">' . esc_html( (string) $t['name'] ) . '</span><span class="auvyx-muted"><code>auvyxmcp_' . esc_html( (string) $t['prefix'] ) . '_…</code></span></td>';
			echo '<td>' . esc_html( self::user_name( (int) $t['user_id'] ) ) . '</td>';
			echo '<td>' . esc_html( implode( ', ', (array) $t['scopes'] ) ) . '</td>';
			echo '<td class="auvyx-muted">' . esc_html( self::when( (int) $t['created'] ) ) . '</td>';
			echo '<td class="auvyx-muted">' . esc_html( self::when( (int) $t['last_used'] ) ) . '</td>';
			echo '<td class="auvyx-muted">' . esc_html( self::when( (int) $t['expires'] ) ) . '</td><td class="auvyx-table__actions">';
			if ( $revoked ) {
				echo '<span class="auvyx-badge">' . esc_html__( 'Revoked', 'auvyx-builder' ) . '</span>';
			} elseif ( $expired ) {
				echo '<span class="auvyx-badge auvyx-badge--amber">' . esc_html__( 'Expired', 'auvyx-builder' ) . '</span>';
			} else {
				echo '<form method="post">';
				wp_nonce_field( 'auvyx-mcp-revoke-' . $id );
				echo '<input type="hidden" name="auvyx_mcp_action" value="revoke"><input type="hidden" name="auvyx_mcp_id" value="' . esc_attr( $id ) . '"><button type="submit" class="button button-small button-link-delete">' . esc_html__( 'Revoke', 'auvyx-builder' ) . '</button></form>';
			}
			echo '</td></tr>';
		}
		echo '</tbody></table></section>';
	}

	private function print_audit(): void {
		$log = array_reverse( array_slice( Audit::all(), -100 ) );
		echo '<details class="auvyx-card auvyx-card--flush"' . ( array() === $log ? '' : ' open' ) . '><summary>' . esc_html__( 'What the connections did', 'auvyx-builder' ) . ' <span class="auvyx-muted">' . esc_html__( 'the last 100 requests (500 are kept)', 'auvyx-builder' ) . '</span></summary>';
		if ( array() === $log ) {
			echo '<div class="auvyx-empty">' . esc_html__( 'Nothing yet.', 'auvyx-builder' ) . '</div></details>';
			return;
		}
		echo '<table class="auvyx-table"><thead><tr><th>' . esc_html__( 'When', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Connection', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Request', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Page', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Result', 'auvyx-builder' ) . '</th></tr></thead><tbody>';
		foreach ( $log as $e ) {
			$code = (int) $e['code'];
			printf(
				'<tr><td class="auvyx-muted">%1$s</td><td>%2$s</td><td><code>%3$s %4$s</code></td><td>%5$s</td><td><span class="auvyx-badge%6$s">%7$d</span></td></tr>',
				esc_html( self::when( (int) $e['time'] ) ),
				esc_html( '' !== (string) $e['name'] ? (string) $e['name'] : __( '(unknown token)', 'auvyx-builder' ) ),
				esc_html( (string) $e['method'] ),
				esc_html( (string) $e['route'] ),
				(int) $e['post'] > 0 ? esc_html( get_the_title( (int) $e['post'] ) . ' #' . (int) $e['post'] ) : '—',
				$code >= 400 ? ' auvyx-badge--amber' : ' auvyx-badge--green',
				(int) $code
			);
		}
		echo '</tbody></table></details>';
	}
}
