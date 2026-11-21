/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.nrnmusic.music.ui.screens.settings.integrations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.navigation.NavController
import com.nrnmusic.music.LocalPlayerAwareWindowInsets
import com.nrnmusic.music.R
import com.nrnmusic.music.api.ListenBrainz
import com.nrnmusic.music.constants.EnableListenBrainzScrobblingKey
import com.nrnmusic.music.constants.ListenBrainzTokenKey
import com.nrnmusic.music.constants.ListenBrainzUseNowPlaying
import com.nrnmusic.music.constants.ListenBrainzUsernameKey
import com.nrnmusic.music.ui.component.IconButton
import com.nrnmusic.music.ui.component.Material3SettingsGroup
import com.nrnmusic.music.ui.component.Material3SettingsItem
import com.nrnmusic.music.ui.utils.backToMain
import com.nrnmusic.music.utils.rememberPreference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListenBrainzSettings(
    navController: NavController
) {
    val coroutineScope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current

    var username by rememberPreference(ListenBrainzUsernameKey, "")
    var token by rememberPreference(ListenBrainzTokenKey, "")

    val isLoggedIn = token.isNotBlank()

    val (enabled, onEnabledChange) = rememberPreference(
        key = EnableListenBrainzScrobblingKey,
        defaultValue = false
    )

    val (useNowPlaying, onUseNowPlayingChange) = rememberPreference(
        key = ListenBrainzUseNowPlaying,
        defaultValue = true
    )

    val connectFailedMessage = stringResource(R.string.listenbrainz_connect_failed)

    var showConnectDialog by rememberSaveable { mutableStateOf(false) }
    var isConnecting by rememberSaveable { mutableStateOf(false) }
    var connectError by rememberSaveable { mutableStateOf<String?>(null) }

    if (showConnectDialog) {
        var tempToken by rememberSaveable { mutableStateOf("") }

        AlertDialog(
            properties = DialogProperties(usePlatformDefaultWidth = false),
            onDismissRequest = {
                if (!isConnecting) {
                    showConnectDialog = false
                    connectError = null
                }
            },
            title = { Text(stringResource(R.string.listenbrainz_connect_title)) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = tempToken,
                        onValueChange = {
                            tempToken = it
                            connectError = null
                        },
                        label = { Text(stringResource(R.string.listenbrainz_user_token)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        enabled = !isConnecting,
                    )
                    TextButton(
                        onClick = { uriHandler.openUri("https://listenbrainz.org/settings/") },
                        enabled = !isConnecting,
                    ) {
                        Text(stringResource(R.string.listenbrainz_open_settings))
                    }
                    TextButton(
                        onClick = {
                            uriHandler.openUri("https://listenbrainz.org/login/musicbrainz/?login_hint=register")
                        },
                        enabled = !isConnecting,
                    ) {
                        Text(stringResource(R.string.scrobble_create_account))
                    }

                    connectError?.let { error ->
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }

                    if (isConnecting) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(
                                text = stringResource(R.string.logging_in),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val trimmedToken = tempToken.trim()
                        if (trimmedToken.isBlank()) return@TextButton

                        isConnecting = true
                        connectError = null

                        coroutineScope.launch {
                            val result = withContext(Dispatchers.IO) {
                                ListenBrainz.validateToken(trimmedToken)
                            }
                            result
                                .onSuccess { user ->
                                    username = user.username
                                    token = trimmedToken
                                    enabled = true
                                    showConnectDialog = false
                                    connectError = null
                                }
                                .onFailure { error ->
                                    connectError = error.message ?: connectFailedMessage
                                }
                            isConnecting = false
                        }
                    },
                    enabled = !isConnecting && tempToken.isNotBlank(),
                ) {
                    Text(stringResource(R.string.connect))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        if (!isConnecting) {
                            showConnectDialog = false
                            connectError = null
                        }
                    },
                    enabled = !isConnecting,
                ) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .windowInsetsPadding(
                LocalPlayerAwareWindowInsets.current.only(
                    WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom
                )
            )
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Spacer(
            Modifier.windowInsetsPadding(
                LocalPlayerAwareWindowInsets.current.only(
                    WindowInsetsSides.Top
                )
            )
        )

        Material3SettingsGroup(
            title = stringResource(R.string.account),
            items = listOf(
                Material3SettingsItem(
                    title = {
                        Text(
                            text = if (isLoggedIn) {
                                stringResource(R.string.listenbrainz_connected_as, username)
                            } else {
                                stringResource(R.string.not_logged_in)
                            },
                            modifier = Modifier.alpha(if (isLoggedIn) 1f else 0.5f),
                        )
                    },
                    trailingContent = {
                        if (isLoggedIn) {
                            OutlinedButton(
                                onClick = {
                                    token = ""
                                    username = ""
                                    enabled = false
                                }
                            ) {
                                Text(stringResource(R.string.action_logout))
                            }
                        } else {
                            OutlinedButton(
                                onClick = { showConnectDialog = true },
                                enabled = !isConnecting,
                            ) {
                                Text(stringResource(R.string.action_login))
                            }
                        }
                    },
                    icon = painterResource(R.drawable.music_note)
                ),
            )
        )

        Spacer(Modifier.height(8.dp))

        Material3SettingsGroup(
            title = stringResource(R.string.options),
            items = listOf(
                Material3SettingsItem(
                    title = { Text(stringResource(R.string.enable_scrobbling)) },
                    description = { Text(stringResource(R.string.listenbrainz_enable_description)) },
                    trailingContent = {
                        Switch(
                            checked = enabled,
                            onCheckedChange = onEnabledChange,
                            thumbContent = {
                                Icon(
                                    painter = painterResource(
                                        id = if (enabled) R.drawable.check else R.drawable.close
                                    ),
                                    contentDescription = null,
                                    modifier = Modifier.size(SwitchDefaults.IconSize),
                                )
                            }
                        )
                    },
                    onClick = { onEnabledChange(!enabled) },
                    icon = painterResource(R.drawable.queue_music)
                ),
                Material3SettingsItem(
                    title = { Text(stringResource(R.string.listenbrainz_now_playing)) },
                    description = { Text(stringResource(R.string.listenbrainz_now_playing_description)) },
                    trailingContent = {
                        Switch(
                            checked = useNowPlaying,
                            onCheckedChange = onUseNowPlayingChange,
                            enabled = isLoggedIn && enabled,
                            thumbContent = {
                                Icon(
                                    painter = painterResource(
                                        id = if (useNowPlaying) R.drawable.check else R.drawable.close
                                    ),
                                    contentDescription = null,
                                    modifier = Modifier.size(SwitchDefaults.IconSize),
                                )
                            }
                        )
                    },
                    onClick = {
                        if (isLoggedIn && enabled) onUseNowPlayingChange(!useNowPlaying)
                    },
                    enabled = isLoggedIn && enabled,
                    icon = painterResource(R.drawable.play)
                )
            )
        )

        Spacer(Modifier.height(32.dp))
    }

    TopAppBar(
        title = { Text(stringResource(R.string.listenbrainz_integration)) },
        navigationIcon = {
            IconButton(
                onClick = navController::navigateUp,
                onLongClick = navController::backToMain,
            ) {
                Icon(
                    painter = painterResource(R.drawable.arrow_back),
                    contentDescription = stringResource(R.string.cd_back),
                )
            }
        },
    )
}
